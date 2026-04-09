/**
 * Stripe webhook entrypoint with in-route signature verification.
 * The route still accepts the typed JSON body for deterministic plugin tests.
 */

import type { RouteContext } from "emdash";

import { COMMERCE_LIMITS } from "../kernel/limits.js";
import { hmacSha256HexAsync, constantTimeEqualHexAsync } from "../lib/crypto-adapter.js";
import { COMMERCE_SETTINGS_KEYS } from "../settings-keys.js";
import { STRIPE_WEBHOOK_SIGNATURE } from "../services/commerce-provider-contracts.js";
import { throwCommerceApiError } from "../route-errors.js";
import type { StripeWebhookEventInput, StripeWebhookInput } from "../schemas.js";
import { resolveWebhookCommerceSettings } from "../settings-validation.js";
import { handlePaymentWebhook, type CommerceWebhookAdapter } from "./webhook-handler.js";
import { requirePost } from "../lib/require-post.js";

const MAX_WEBHOOK_BODY_BYTES = COMMERCE_LIMITS.maxWebhookBodyBytes;
const STRIPE_SIGNATURE_HEADER = "Stripe-Signature";
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = STRIPE_WEBHOOK_SIGNATURE.defaultToleranceSeconds;
const STRIPE_SIGNATURE_TOLERANCE_MIN_SECONDS = STRIPE_WEBHOOK_SIGNATURE.minToleranceSeconds;
const STRIPE_SIGNATURE_TOLERANCE_MAX_SECONDS = STRIPE_WEBHOOK_SIGNATURE.maxToleranceSeconds;
const STRIPE_SIGNATURE_TIMESTAMP_RE = /^\d+$/;
const STRIPE_PROVIDER_ID = "stripe";
const STRIPE_SIGNATURE_TIMESTAMP_DIGITS_RE = /^\d+$/;

const STRIPE_WEBHOOK_METADATA_KEYS = {
	orderId: "orderId",
	finalizeToken: "finalizeToken",
} as const;

type StripeWebhookMetadataKey = keyof typeof STRIPE_WEBHOOK_METADATA_KEYS;

function readRequiredMetadataField(metadata: Record<string, unknown>, key: StripeWebhookMetadataKey): string | undefined {
	const raw = metadata[key];
	if (typeof raw !== "string") return undefined;
	const normalized = raw.trim();
	if (!normalized.length) return undefined;
	return normalized;
}

type ParsedStripeSignature = {
	timestamp: number;
	signatures: string[];
};

type StripeMetadataInput = {
	orderId: string;
	finalizeToken: string;
	externalEventId: string;
};

function normalizeHeaderKeyValue(raw: string): [string, string] | null {
	const equalsIndex = raw.indexOf("=");
	if (equalsIndex < 0) return null;
	const key = raw.slice(0, equalsIndex).trim();
	const value = raw.slice(equalsIndex + 1).trim();
	if (!key || !value) return null;
	return [key, value];
}

function clampStripeTolerance(raw: unknown): number {
	const parsed =
		typeof raw === "number"
			? raw
			: typeof raw === "string" && STRIPE_SIGNATURE_TIMESTAMP_DIGITS_RE.test(raw.trim())
				? Number.parseInt(raw, 10)
				: Number.NaN;
	if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return STRIPE_SIGNATURE_TOLERANCE_SECONDS;
	if (parsed < STRIPE_SIGNATURE_TOLERANCE_MIN_SECONDS) return STRIPE_SIGNATURE_TOLERANCE_MIN_SECONDS;
	if (parsed > STRIPE_SIGNATURE_TOLERANCE_MAX_SECONDS) return STRIPE_SIGNATURE_TOLERANCE_MAX_SECONDS;
	return parsed;
}

function extractStripeFinalizeMetadata(event: unknown): StripeMetadataInput | null {
	if (!event || typeof event !== "object") return null;
	const payload = event as StripeWebhookEventInput;
	if (!("id" in payload) || typeof payload.id !== "string" || payload.id.trim().length === 0) return null;
	if (
		!payload.data ||
		typeof payload.data !== "object" ||
		!payload.data.object ||
		typeof payload.data.object !== "object"
	) {
		return null;
	}

	const metadata = payload.data.object.metadata;
	if (!metadata || typeof metadata !== "object") return null;
	const objectMetadata = metadata as Record<string, unknown>;

	const orderId = readRequiredMetadataField(objectMetadata, "orderId");
	const finalizeToken = readRequiredMetadataField(objectMetadata, "finalizeToken");
	if (!orderId || !finalizeToken) return null;

	return {
		orderId,
		finalizeToken,
		externalEventId: payload.id.trim(),
	};
}

function parseStripeSignatureHeader(raw: string | null): ParsedStripeSignature | null {
	if (!raw) return null;
	const sigParts = raw.split(",");
	let timestamp: number | null = null;
	const signatures: string[] = [];

	for (const part of sigParts) {
		const pair = normalizeHeaderKeyValue(part);
		if (!pair) continue;
		const [key, value] = pair;
		if (!key || !value) continue;
		if (key === "t") {
			if (timestamp !== null) return null;
			if (!STRIPE_SIGNATURE_TIMESTAMP_RE.test(value)) return null;
			const parsed = Number.parseInt(value, 10);
			if (Number.isNaN(parsed)) return null;
			timestamp = parsed;
			continue;
		}
		if (key === "v1") {
			signatures.push(value);
		}
	}
	if (timestamp === null || signatures.length === 0) return null;
	return { timestamp, signatures };
}

async function hashWithSecret(secret: string, timestamp: number, rawBody: string): Promise<string> {
	return hmacSha256HexAsync(secret, `${timestamp}.${rawBody}`);
}

function isWebhookBodyWithinSizeLimit(rawBody: string): boolean {
	return new TextEncoder().encode(rawBody).byteLength <= MAX_WEBHOOK_BODY_BYTES;
}

async function isWebhookSignatureValid(
	secret: string,
	rawBody: string,
	rawSignature: string | null,
	toleranceSeconds: number,
): Promise<boolean> {
	const parsed = parseStripeSignatureHeader(rawSignature);
	if (!parsed) return false;
	const now = Date.now() / 1000;
	if (Math.abs(now - parsed.timestamp) > toleranceSeconds) return false;

	const expected = await hashWithSecret(secret, parsed.timestamp, rawBody);
	for (const sig of parsed.signatures) {
		if (await constantTimeEqualHexAsync(sig, expected)) return true;
	}
	return false;
}

async function ensureValidStripeWebhookSignature(
	ctx: RouteContext<StripeWebhookInput>,
): Promise<void> {
	const { stripeWebhookSecret: secret } = await resolveWebhookCommerceSettings(ctx);

	const rawBody = await ctx.request.clone().text();
	const tolerance = await resolveWebhookSignatureToleranceSeconds(ctx);
	if (!isWebhookBodyWithinSizeLimit(rawBody)) {
		throwCommerceApiError({
			code: "PAYLOAD_TOO_LARGE",
			message: "Webhook body is too large",
		});
	}
	const rawSig = ctx.request.headers.get(STRIPE_SIGNATURE_HEADER);
	if (!(await isWebhookSignatureValid(secret, rawBody, rawSig, tolerance))) {
		throwCommerceApiError({
			code: "WEBHOOK_SIGNATURE_INVALID",
			message: "Invalid Stripe webhook signature",
		});
	}
}

async function resolveWebhookSignatureToleranceSeconds(ctx: RouteContext<StripeWebhookInput>): Promise<number> {
	const setting = await ctx.kv.get<unknown>(COMMERCE_SETTINGS_KEYS.stripeWebhookToleranceSeconds);
	if (typeof setting === "number") {
		return clampStripeTolerance(setting);
	}
	return clampStripeTolerance(typeof setting === "string" ? setting : undefined);
}

const stripeWebhookAdapter: CommerceWebhookAdapter<StripeWebhookInput> = {
	providerId: STRIPE_PROVIDER_ID,
	verifyRequest: ensureValidStripeWebhookSignature,
	buildFinalizeInput(ctx) {
		const parsedMetadata = extractStripeFinalizeMetadata(ctx.input);
		if (!parsedMetadata) {
			throwCommerceApiError({
				code: "ORDER_STATE_CONFLICT",
				message: "Missing required emDash webhook metadata",
			});
		}

		return {
			orderId: parsedMetadata.orderId,
			externalEventId: parsedMetadata.externalEventId,
			providerId: STRIPE_PROVIDER_ID,
			finalizeToken: parsedMetadata.finalizeToken,
		};
	},
	buildCorrelationId(ctx) {
		const parsedMetadata = extractStripeFinalizeMetadata(ctx.input);
		if (parsedMetadata) {
			return parsedMetadata.externalEventId;
		}
		return "unknown-event";
	},
	buildRateLimitSuffix() {
		return "stripe:ip";
	},
};

export async function stripeWebhookHandler(ctx: RouteContext<StripeWebhookInput>) {
	requirePost(ctx);
	return handlePaymentWebhook(ctx, stripeWebhookAdapter);
}

export {
	hashWithSecret,
	isWebhookBodyWithinSizeLimit,
	resolveWebhookSignatureToleranceSeconds,
	isWebhookSignatureValid,
	clampStripeTolerance,
	extractStripeFinalizeMetadata,
	parseStripeSignatureHeader,
};
