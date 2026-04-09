/**
 * Settings validation matrix and helpers for commerce plugin configuration.
 */

import type { RouteContext } from "emdash";

import { COMMERCE_SETTINGS_KEYS } from "./settings-keys.js";
import { throwCommerceApiError } from "./route-errors.js";

export const STRIPE_PUBLISHABLE_KEY_PREFIXES = ["pk_live_", "pk_test_"] as const;
export const STRIPE_SECRET_KEY_PREFIXES = ["sk_live_", "sk_test_", "rk_live_", "rk_test_"] as const;
export const DEFAULT_CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const STRIPE_WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9_]+$/;
const ALPHANUMERIC_STRIPE_KEY_SUFFIX = /^[A-Za-z0-9_]+$/;

type CommerceSettingName = keyof Omit<
	typeof COMMERCE_SETTINGS_KEYS,
	"stripeWebhookToleranceSeconds"
>;

type CommerceSettingMatrixEntry = {
	name: CommerceSettingName;
	kvKey: string;
	requiredIn: readonly CommerceSettingsProfile[];
	validate(raw: unknown): raw is string;
	errorMessage: string;
};

export type CommerceSettingsProfile = "webhook" | "payment-provider" | "all";

export const COMMERCE_SETTINGS_PROFILE_REQUIREMENTS = {
	webhook: ["stripeWebhookSecret"],
	"payment-provider": ["stripePublishableKey", "stripeSecretKey", "defaultCurrency"],
	all: ["stripePublishableKey", "stripeSecretKey", "stripeWebhookSecret", "defaultCurrency"],
} as const satisfies Record<CommerceSettingsProfile, readonly CommerceSettingName[]>;

export const COMMERCE_SETTINGS_MATRIX: readonly CommerceSettingMatrixEntry[] = [
	{
		name: "stripePublishableKey",
		kvKey: COMMERCE_SETTINGS_KEYS.stripePublishableKey,
		requiredIn: ["payment-provider", "all"],
		validate(raw) {
			return (
				typeof raw === "string" &&
				STRIPE_PUBLISHABLE_KEY_PREFIXES.some((prefix) => raw.startsWith(prefix)) &&
				ALPHANUMERIC_STRIPE_KEY_SUFFIX.test(raw.slice(8))
			);
		},
		errorMessage:
			"Stripe publishable key must start with pk_live_ or pk_test_ and include a non-empty key segment",
	},
	{
		name: "stripeSecretKey",
		kvKey: COMMERCE_SETTINGS_KEYS.stripeSecretKey,
		requiredIn: ["payment-provider", "all"],
		validate(raw) {
			return (
				typeof raw === "string" &&
				STRIPE_SECRET_KEY_PREFIXES.some((prefix) => raw.startsWith(prefix)) &&
				ALPHANUMERIC_STRIPE_KEY_SUFFIX.test(raw.slice(8))
			);
		},
		errorMessage:
			"Stripe secret key must start with sk_live_, sk_test_, rk_live_, or rk_test_ and include a non-empty key segment",
	},
	{
		name: "stripeWebhookSecret",
		kvKey: COMMERCE_SETTINGS_KEYS.stripeWebhookSecret,
		requiredIn: ["webhook", "all"],
		validate(raw) {
			return typeof raw === "string" && STRIPE_WEBHOOK_SECRET_PATTERN.test(raw);
		},
		errorMessage: "Stripe webhook secret must start with whsec_ and include a non-empty key segment",
	},
	{
		name: "defaultCurrency",
		kvKey: COMMERCE_SETTINGS_KEYS.defaultCurrency,
		requiredIn: ["payment-provider", "all"],
		validate(raw) {
			return typeof raw === "string" && DEFAULT_CURRENCY_PATTERN.test(raw);
		},
		errorMessage: "defaultCurrency must be an ISO-4217 3-letter uppercase code (for example: USD)",
	},
];

export type CommerceSettingsByProfile<P extends CommerceSettingsProfile> = {
	[K in (typeof COMMERCE_SETTINGS_PROFILE_REQUIREMENTS)[P][number]]: string;
};

function getRequiredSettingNames(profile: CommerceSettingsProfile): readonly CommerceSettingName[] {
	return COMMERCE_SETTINGS_PROFILE_REQUIREMENTS[profile];
}

function isProfileRequired(entry: CommerceSettingMatrixEntry, profile: CommerceSettingsProfile): boolean {
	return entry.requiredIn.includes(profile);
}

function toRouteContextKV(ctx: RouteContext<unknown>): {
	get: <T>(key: string) => Promise<T | null>;
} {
	return ctx.kv;
}

function throwInvalidSettingError(setting: CommerceSettingName, reason: string): never {
	throwCommerceApiError({
		code: "PROVIDER_UNAVAILABLE",
		message: `Invalid ${setting}: ${reason}`,
	});
}

function validateRequiredSetting(
	entry: CommerceSettingMatrixEntry,
	raw: unknown,
	profiles: readonly CommerceSettingName[],
	entryName: CommerceSettingName,
): void {
	if (!raw) {
		if (profiles.includes(entryName)) {
			throwInvalidSettingError(entryName, `${entryName} is required but was not provided`);
		}
		return;
	}
	if (!entry.validate(raw)) {
		throwInvalidSettingError(entryName, entry.errorMessage);
	}
}

export async function resolveCommerceSettingsProfile<P extends CommerceSettingsProfile>(
	ctx: RouteContext<unknown>,
	profile: P,
): Promise<CommerceSettingsByProfile<P>> {
	const kv = toRouteContextKV(ctx);
	const required = new Set(getRequiredSettingNames(profile));
	const values: Record<string, string> = {};
	for (const entry of COMMERCE_SETTINGS_MATRIX) {
		if (!isProfileRequired(entry, profile)) continue;
		const raw = await kv.get<unknown>(entry.kvKey);
		validateRequiredSetting(entry, raw, [...required], entry.name);
		values[entry.name] = raw as string;
	}
	return values as CommerceSettingsByProfile<P>;
}

export type CommerceWebhookSettings = CommerceSettingsByProfile<"webhook">;

export function resolveWebhookCommerceSettings(ctx: RouteContext<unknown>): Promise<CommerceWebhookSettings> {
	return resolveCommerceSettingsProfile(ctx, "webhook");
}

export function isValidDefaultCurrency(value: unknown): value is string {
	return DEFAULT_CURRENCY_PATTERN.test(String(value ?? ""));
}

