import { createHash, randomUUID } from "node:crypto";
import { gdprModuleManifest, type GdprModuleManifest } from "../manifest.js";
import {
	type GdprAuditLogRecord,
	type GdprConsentPurpose,
	type GdprConsentRecord,
	type GdprDataSubject,
	type GdprDataSubjectKind,
	type GdprLegalHoldRecord,
	type GdprOperationRecord,
	type GdprExportRecord,
	type GdprPersonalDataProvider,
	type GdprProviderCapabilities,
	type GdprRight,
	type GdprRequestRecord,
} from "./types.js";
import { GdprWorkflowEngine } from "./workflow/gdpr-workflow.js";
import {
	type GdprStorageCollection,
	createConsentStore,
	createLegalHoldStore,
	createRequestStore,
	createOperationStore,
	createExportStore,
	createAuditStore,
} from "./workflow/gdpr-persistence.js";

type RequestAnchorPayload = {
	orderId?: string;
	cartId?: string;
	emailHash?: string;
};

type RequestPayload = {
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	right?: GdprRight;
	requestedBy: string;
	scope?: Record<string, unknown>;
	idempotencyKey?: string;
	anchor?: RequestAnchorPayload;
};

type ConsentPayload = {
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	purpose: GdprConsentPurpose;
	granted: boolean;
};

type ConsentLookupPayload = Pick<ConsentPayload, "subjectId" | "subjectKind">;
type ConsentCheckPayload = Pick<ConsentPayload, "subjectId" | "subjectKind" | "purpose">;
type ConsentRevokePayload = Pick<ConsentPayload, "subjectId" | "subjectKind" | "purpose">;

type LegalHoldPayload = {
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	reasonCode: string;
	reasonDetails: string;
	expiresAt?: string;
};

type GdprRouteContext = {
	request: {
		method: string;
		json?: () => Promise<unknown>;
	};
	params?: Record<string, string>;
	query?: Record<string, string>;
};

type GdprHandler = (ctx: GdprRouteContext) => Promise<unknown>;
type GdprEngineAccessor = () => GdprWorkflowEngine;
type CommerceDataRecord = Record<string, unknown>;
type CommerceCoreExportRecord = {
	id: string;
	fields: Record<string, unknown>;
};
type CommerceCoreCollections = {
	orders?: GdprStorageCollection<CommerceDataRecord>;
	carts?: GdprStorageCollection<CommerceDataRecord>;
	paymentAttempts?: GdprStorageCollection<CommerceDataRecord>;
};

function safeQueryField<T extends CommerceDataRecord>(
	collection: GdprStorageCollection<T> | undefined,
	field: string,
	value: string,
): Promise<Array<{ id: string; data: T }>> {
	if (!collection?.query) {
		return Promise.resolve([]);
	}
	return Promise.resolve(collection.query({ where: { [field]: value } })).then((response) =>
		response.items
			.map((item) => {
				if (!item || typeof item.id !== "string" || typeof item.data !== "object" || item.data === null) {
					return null;
				}
				return { id: item.id, data: item.data as T };
			})
			.filter((entry): entry is { id: string; data: T } => entry !== null)
			.toSorted((left, right) => left.id.localeCompare(right.id)),
	);
}

function safeGetById<T extends CommerceDataRecord>(
	collection: GdprStorageCollection<T> | undefined,
	id: string | undefined,
): Promise<{ id: string; data: T } | null> {
	if (!collection || !id) {
		return Promise.resolve(null);
	}
	return Promise.resolve(collection.get(id)).then((value) => {
		if (!value || typeof value !== "object") {
			return null;
		}
		return { id, data: value as T };
	});
}

function subjectScopeDigest(subject: GdprDataSubject): string {
	const anchor = subject.anchor;
	return [
		subject.subjectId,
		subject.subjectKind,
		anchor?.orderId ?? "",
		anchor?.cartId ?? "",
		anchor?.emailHash ?? "",
	].join("|");
}

async function collectCommerceSubjectRecords(
	subject: GdprDataSubject,
	collections: CommerceCoreCollections,
	options?: {
		includeSynthetic?: boolean;
		extractedAt?: string;
	},
): Promise<CommerceCoreExportRecord[]> {
	const records: CommerceCoreExportRecord[] = [];
	const now = options?.extractedAt ?? new Date().toISOString();
	const orderId = subject.anchor?.orderId;
	const cartId = subject.anchor?.cartId;
	if (orderId && collections.orders) {
		const order = await safeGetById(collections.orders, orderId);
		if (order) {
			records.push(buildCommerceOrderRecord(subject, order.id, order.data as CommerceDataRecord));
		}
	}
	if (cartId && collections.carts) {
		const cart = await safeGetById(collections.carts, cartId);
		if (cart) {
			records.push(buildCommerceCartRecord(subject, cart.id, cart.data as CommerceDataRecord));
		}
	}
	if (orderId && collections.paymentAttempts) {
		const paymentAttempts = await safeQueryField(collections.paymentAttempts, "orderId", orderId);
		for (const paymentAttempt of paymentAttempts) {
			records.push(buildCommercePaymentAttemptRecord(subject, paymentAttempt.id, paymentAttempt.data as CommerceDataRecord));
		}
	}
	if (records.length === 0 && options?.includeSynthetic !== false) {
		records.push({
			id: subject.subjectId,
			fields: {
				subjectId: subject.subjectId,
				subjectKind: subject.subjectKind,
				extractedAt: now,
				reason: "No core records found for provided anchors",
			},
		});
	}
	return records;
}

function buildCommerceOrderRecord(
	subject: GdprDataSubject,
	orderId: string,
	order: CommerceDataRecord,
): CommerceCoreExportRecord {
	return {
		id: orderId,
		fields: {
			source: "order",
			subjectId: subject.subjectId,
			subjectKind: subject.subjectKind,
			cartId: order.cartId,
			paymentPhase: order.paymentPhase,
			currency: order.currency,
			totalMinor: order.totalMinor,
			lineItemCount: Array.isArray(order.lineItems) ? order.lineItems.length : undefined,
			createdAt: order.createdAt,
			updatedAt: order.updatedAt,
		},
	};
}

function buildCommerceCartRecord(
	subject: GdprDataSubject,
	cartId: string,
	cart: CommerceDataRecord,
): CommerceCoreExportRecord {
	return {
		id: cartId,
		fields: {
			source: "cart",
			subjectId: subject.subjectId,
			subjectKind: subject.subjectKind,
			currency: cart.currency,
			lineItemCount: Array.isArray(cart.lineItems) ? cart.lineItems.length : undefined,
			createdAt: cart.createdAt,
			updatedAt: cart.updatedAt,
		},
	};
}

function buildCommercePaymentAttemptRecord(
	subject: GdprDataSubject,
	attemptId: string,
	attempt: CommerceDataRecord,
): CommerceCoreExportRecord {
	return {
		id: attemptId,
		fields: {
			source: "paymentAttempt",
			subjectId: subject.subjectId,
			subjectKind: subject.subjectKind,
			orderId: attempt.orderId,
			providerId: attempt.providerId,
			status: attempt.status,
			createdAt: attempt.createdAt,
			updatedAt: attempt.updatedAt,
		},
	};
}

function hasAnyCommerceCollections(collections: CommerceCoreCollections): boolean {
	return Boolean(collections.orders || collections.carts || collections.paymentAttempts);
}

type ModuleLifecycle = () => Promise<void> | void;

export type RouteInput = {
	path: string;
	method: "GET" | "POST" | "DELETE";
	handler: GdprHandler;
	requireAuth: boolean;
};

export type CommerceHost = {
	logger: {
		info: (...args: unknown[]) => void;
		warn: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
	config: {
		get: (key: string, fallback?: unknown) => unknown;
		register: (key: string, schema: unknown) => void;
	};
	routes: {
		registerAdminRoute: (route: RouteInput) => void;
		registerRoute?: (route: RouteInput) => void;
	};
	hooks: {
		on: (event: string, handler: (event: unknown) => Promise<void> | void) => void;
	};
	admin: {
		registerSettingsTab?: (tab: { id: string; label: string }) => void;
		registerOrderPanel?: (panel: { id: string; title: string }) => void;
	};
	migrations: {
		register: (moduleId: string, migrations: string[]) => void;
	};
	jobs: {
		register: (id: string, handler: (ctx: Record<string, unknown>) => Promise<unknown>) => void;
	};
	storage: {
		registerCollection: (name: string) => Promise<void> | void;
		collections?: Record<string, GdprStorageCollection<unknown>>;
	};
	gdpr?: {
		registerProvider: (provider: GdprPersonalDataProvider) => void;
	};
};

export type CommerceModuleDefinition = {
	id: string;
	manifest: GdprModuleManifest;
	health: "pending" | "ready";
	register: ModuleLifecycle;
	init: ModuleLifecycle;
	ready: ModuleLifecycle;
	shutdown?: ModuleLifecycle;
};

function createErrorResponse(message: string, code: string, status = 400) {
	return {
		ok: false,
		status,
		errorCode: code,
		message,
	};
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function asRoute(route: RouteInput) {
	return route;
}

function disabledPayload(operation: string) {
	return {
		ok: false,
		enabled: false,
		operation,
		reason: "GDPR module is currently disabled",
	};
}

function normalizeRequestPayload(raw: unknown): RequestPayload | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as RequestPayload;
	if (typeof candidate.subjectId !== "string" || candidate.subjectId.length < 1) return null;
	if (typeof candidate.subjectKind !== "string" || candidate.subjectKind.length < 1) return null;
	if (typeof candidate.requestedBy !== "string" || candidate.requestedBy.length < 1) return null;
	return {
		subjectId: candidate.subjectId,
		subjectKind: candidate.subjectKind,
		right: candidate.right,
		requestedBy: candidate.requestedBy,
		scope: candidate.scope,
		idempotencyKey: candidate.idempotencyKey,
		anchor:
			candidate.anchor && typeof candidate.anchor === "object"
				? normalizeSubjectAnchor(candidate.anchor)
				: undefined,
	};
}

function normalizeSubjectAnchor(raw: unknown): RequestAnchorPayload | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const candidate = raw as Partial<RequestAnchorPayload>;
	const anchor: RequestAnchorPayload = {};
	if (typeof candidate.orderId === "string" && candidate.orderId.length > 0) {
		anchor.orderId = candidate.orderId;
	}
	if (typeof candidate.cartId === "string" && candidate.cartId.length > 0) {
		anchor.cartId = candidate.cartId;
	}
	if (typeof candidate.emailHash === "string" && candidate.emailHash.length > 0) {
		anchor.emailHash = candidate.emailHash;
	}
	return Object.keys(anchor).length > 0 ? anchor : undefined;
}

function normalizeConsentPayload(raw: unknown): ConsentPayload | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as Partial<ConsentPayload>;
	if (typeof candidate.subjectId !== "string" || candidate.subjectId.length < 1) return null;
	if (typeof candidate.subjectKind !== "string" || candidate.subjectKind.length < 1) return null;
	if (typeof candidate.purpose !== "string" || candidate.purpose.length < 1) return null;
	if (typeof candidate.granted !== "boolean") return null;
	return {
		subjectId: candidate.subjectId,
		subjectKind: candidate.subjectKind,
		purpose: candidate.purpose,
		granted: candidate.granted,
	};
}

function normalizeConsentLookup(raw: unknown): ConsentLookupPayload | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as Partial<ConsentPayload>;
	if (typeof candidate.subjectId !== "string" || candidate.subjectId.length < 1) return null;
	if (typeof candidate.subjectKind !== "string" || candidate.subjectKind.length < 1) return null;
	return { subjectId: candidate.subjectId, subjectKind: candidate.subjectKind };
}

function normalizeConsentCheck(raw: unknown): ConsentCheckPayload | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as Partial<ConsentCheckPayload>;
	if (typeof candidate.subjectId !== "string" || candidate.subjectId.length < 1) return null;
	if (typeof candidate.subjectKind !== "string" || candidate.subjectKind.length < 1) return null;
	if (typeof candidate.purpose !== "string" || candidate.purpose.length < 1) return null;
	return {
		subjectId: candidate.subjectId,
		subjectKind: candidate.subjectKind,
		purpose: candidate.purpose,
	};
}

function normalizeLegalHoldPayload(raw: unknown): LegalHoldPayload | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as Partial<LegalHoldPayload>;
	if (typeof candidate.subjectId !== "string" || candidate.subjectId.length < 1) return null;
	if (typeof candidate.subjectKind !== "string" || candidate.subjectKind.length < 1) return null;
	if (typeof candidate.reasonCode !== "string" || candidate.reasonCode.length < 1) return null;
	if (typeof candidate.reasonDetails !== "string" || candidate.reasonDetails.length < 1) return null;
	if (candidate.expiresAt !== undefined && typeof candidate.expiresAt !== "string") return null;
	if (candidate.expiresAt !== undefined && Number.isNaN(Date.parse(candidate.expiresAt))) return null;
	return {
		subjectId: candidate.subjectId,
		subjectKind: candidate.subjectKind,
		reasonCode: candidate.reasonCode,
		reasonDetails: candidate.reasonDetails,
		expiresAt: candidate.expiresAt,
	};
}

function normalizeLegalHoldLookup(raw: unknown): Pick<LegalHoldPayload, "subjectId" | "subjectKind"> | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as Partial<LegalHoldPayload>;
	if (typeof candidate.subjectId !== "string" || candidate.subjectId.length < 1) return null;
	if (typeof candidate.subjectKind !== "string" || candidate.subjectKind.length < 1) return null;
	return { subjectId: candidate.subjectId, subjectKind: candidate.subjectKind };
}

function buildCoreProvider(coreCollections?: CommerceCoreCollections): GdprPersonalDataProvider {
	const capabilities: GdprProviderCapabilities = {
		canAccessExport: true,
		canErase: true,
		canAnonymize: true,
		canRectify: true,
	};
	const collections = coreCollections ?? {};
	return {
		id: "dashcommerce-core",
		name: "DashingCommerce Core Data Provider",
		capabilities: async () => capabilities,
		discoverSubjects: async () => [],
		exportData: async (subject) => {
			const now = new Date().toISOString();
			const records = await collectCommerceSubjectRecords(subject, collections, { includeSynthetic: true, extractedAt: now });
			return {
				providerId: "dashcommerce-core",
				kind: "commerce-snapshot",
				records,
				metadata: {
					anchor: subject.anchor ?? null,
					extractedAt: now,
					hasCollections: hasAnyCommerceCollections(collections),
				},
			};
		},
		anonymizeData: async (subject) => {
			const records = await collectCommerceSubjectRecords(subject, collections, { includeSynthetic: false });
			const processed = records.length;
			if (processed === 0) {
				return {
					providerId: "dashcommerce-core",
					action: "anonymize",
					status: "skipped",
					processed,
					requestIdempotencyKey: sha256(`anonymize_${subjectScopeDigest(subject)}`),
					message: "no matching core records found for subject",
				};
			}
			return {
				providerId: "dashcommerce-core",
				action: "anonymize",
				status: "success",
				processed,
				requestIdempotencyKey: sha256(`anonymize_${subjectScopeDigest(subject)}`),
				message: "anonymize request captured for v1 provider-only snapshot",
			};
		},
		eraseData: async (subject) => {
			const records = await collectCommerceSubjectRecords(subject, collections, { includeSynthetic: false });
			const processed = records.length;
			if (processed === 0) {
				return {
					providerId: "dashcommerce-core",
					action: "erase",
					status: "skipped",
					processed,
					requestIdempotencyKey: sha256(`erase_${subjectScopeDigest(subject)}`),
					message: "no matching core records found for subject",
				};
			}
			return {
				providerId: "dashcommerce-core",
				action: "erase",
				status: "success",
				processed,
				requestIdempotencyKey: sha256(`erase_${subjectScopeDigest(subject)}`),
				message: "erase request captured for v1 provider-only snapshot",
			};
		},
		rectifyData: async (subject, patch) => {
			const hasPatch = Object.keys(patch ?? {}).length > 0;
			const records = await collectCommerceSubjectRecords(subject, collections, { includeSynthetic: false });
			const processed = hasPatch ? records.length : 0;
			if (!hasPatch) {
				return {
					providerId: "dashcommerce-core",
					action: "rectify",
					status: "skipped",
					processed,
					requestIdempotencyKey: sha256(`rectify_${subjectScopeDigest(subject)}`),
					message: "no rectify patch provided in v1",
				};
			}
			return {
				providerId: "dashcommerce-core",
				action: "rectify",
				status: records.length > 0 ? "success" : "skipped",
				processed,
				requestIdempotencyKey: sha256(`rectify_${subjectScopeDigest(subject)}`),
				message: records.length > 0
					? "rectify request captured for v1 provider-only snapshot"
					: "no matching core records found for subject",
			};
		},
	};
}

function summarizeRequest(
	request: GdprRequestRecord,
	operations: GdprOperationRecord[],
) {
	return {
		ok: true,
		requestId: request.requestId,
		status: request.status,
		right: request.right,
		requestedBy: request.requestedBy,
		operations: operations.map((operation) => ({
			providerId: operation.providerId,
			action: operation.action,
			status: operation.status,
		})),
	};
}

function buildRequestCreateHandler(
	engineAccessor: GdprEngineAccessor,
	moduleEnabled: () => boolean,
	presetRight?: GdprRight,
): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("request-submit");
		const payload = normalizeRequestPayload(await (ctx.request.json?.() ?? Promise.resolve(null)));
		if (!payload) {
			return createErrorResponse("Invalid request payload", "INVALID_REQUEST_PAYLOAD");
		}
		const subject: GdprDataSubject = {
			subjectId: payload.subjectId,
			subjectKind: payload.subjectKind,
			anchor: normalizeSubjectAnchor(payload.anchor),
		};
		const right: GdprRight = presetRight ?? payload.right ?? "portability";
		const engine = engineAccessor();
		const result = await engine.submitRequest({
			subjectId: subject.subjectId,
			subjectKind: subject.subjectKind,
			subjectAnchor: subject.anchor,
			right,
			requestedBy: payload.requestedBy,
			scope: payload.scope,
			idempotencyKey: payload.idempotencyKey,
		});
		return summarizeRequest(result.request, result.operations);
	};
}

function buildRequestGetHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("request-get");
		const requestId = ctx.params?.id;
		if (!requestId) return createErrorResponse("Missing request id", "MISSING_REQUEST_ID");
		const engine = engineAccessor();
		const request = await engine.getRequestById(requestId);
		if (!request) return createErrorResponse("Request not found", "REQUEST_NOT_FOUND", 404);
		const operations = await engine.getOperationsForRequest(requestId);
		return {
			ok: true,
			request,
			operations,
		};
	};
}

function buildRequestListHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async () => {
		if (!moduleEnabled()) return disabledPayload("request-list");
		const engine = engineAccessor();
		const requests = await engine.listRequests();
		return {
			ok: true,
			total: requests.length,
			requests,
		};
	};
}

function buildAuditHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("audit");
		const requestId = ctx.params?.id;
		const engine = engineAccessor();
		const events = await engine.getAuditLog(requestId);
		return {
			ok: true,
			requestId,
			events,
		};
	};
}

function buildConsentLookupHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("consent-read");
		const querySubject: ConsentLookupPayload | null = ctx.query &&
			typeof ctx.query.subjectId === "string" &&
			typeof ctx.query.subjectKind === "string"
			? { subjectId: ctx.query.subjectId, subjectKind: ctx.query.subjectKind }
			: null;
		const payload = querySubject ?? normalizeConsentLookup(await (ctx.request.json?.() ?? Promise.resolve(null)));
		if (!payload) {
			return createErrorResponse("Invalid consent query payload", "INVALID_CONSENT_QUERY");
		}

		const subject = { subjectId: payload.subjectId, subjectKind: payload.subjectKind };
		const engine = engineAccessor();
		const consents = await engine.getConsents(subject.subjectId, subject.subjectKind);
		return {
			ok: true,
			subjectId: subject.subjectId,
			subjectKind: subject.subjectKind,
			consents,
		};
	};
}

function buildConsentCheckHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("consent-check");
		const query: ConsentCheckPayload | null = ctx.query &&
			typeof ctx.query.subjectId === "string" &&
			typeof ctx.query.subjectKind === "string" &&
			typeof ctx.query.purpose === "string"
			? {
					subjectId: ctx.query.subjectId,
					subjectKind: ctx.query.subjectKind,
					purpose: ctx.query.purpose as GdprConsentPurpose,
				}
			: null;
		const payload = query ?? normalizeConsentCheck(await (ctx.request.json?.() ?? Promise.resolve(null)));
		if (!payload) {
			return createErrorResponse("Invalid consent check payload", "INVALID_CONSENT_CHECK_PAYLOAD");
		}
		const engine = engineAccessor();
		return {
			ok: true,
			subjectId: payload.subjectId,
			subjectKind: payload.subjectKind,
			purpose: payload.purpose,
			hasConsent: await engine.hasConsent({
				subjectId: payload.subjectId,
				subjectKind: payload.subjectKind,
				purpose: payload.purpose,
			}),
		};
	};
}

function buildConsentUpdateHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("consent-write");
		const payload = normalizeConsentPayload(await (ctx.request.json?.() ?? Promise.resolve(null)));
		if (!payload) return createErrorResponse("Invalid consent payload", "INVALID_CONSENT_PAYLOAD");
		const engine = engineAccessor();
		const consent = await engine.setConsent({
			subjectId: payload.subjectId,
			subjectKind: payload.subjectKind,
			purpose: payload.purpose,
			granted: payload.granted,
		});
		return {
			ok: true,
			consent,
		};
	};
}

function buildConsentRevokeHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("consent-revoke");
		const rawPayload = (await (ctx.request.json?.() ?? Promise.resolve(null))) as Partial<ConsentRevokePayload> | null;
		if (
			typeof rawPayload?.subjectId !== "string" ||
			rawPayload.subjectId.length < 1 ||
			typeof rawPayload?.subjectKind !== "string" ||
			rawPayload.subjectKind.length < 1 ||
			typeof rawPayload?.purpose !== "string" ||
			rawPayload.purpose.length < 1
		) {
			return createErrorResponse("Invalid consent payload", "INVALID_CONSENT_PAYLOAD");
		}
		const payload: ConsentRevokePayload = {
			subjectId: rawPayload.subjectId,
			subjectKind: rawPayload.subjectKind,
			purpose: rawPayload.purpose,
		};
		const engine = engineAccessor();
		await engine.revokeConsent({
			subjectId: payload.subjectId,
			subjectKind: payload.subjectKind,
			purpose: payload.purpose,
		});
		const consents = await engine.getConsents(payload.subjectId, payload.subjectKind);
		return {
			ok: true,
			subjectId: payload.subjectId,
			subjectKind: payload.subjectKind,
			consents,
		};
	};
}

function buildLegalHoldCreateHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("legal-hold-create");
		const payload = normalizeLegalHoldPayload(await (ctx.request.json?.() ?? Promise.resolve(null)));
		if (!payload) {
			return createErrorResponse("Invalid legal hold payload", "INVALID_LEGAL_HOLD_PAYLOAD");
		}
		const engine = engineAccessor();
		await engine.setLegalHold({
			id: randomUUID(),
			subjectId: payload.subjectId,
			subjectKind: payload.subjectKind,
			reasonCode: payload.reasonCode,
			reasonDetails: payload.reasonDetails,
			expiresAt: payload.expiresAt,
			createdAt: new Date().toISOString(),
		});
		const holds = await engine.getLegalHolds({ subjectId: payload.subjectId, subjectKind: payload.subjectKind });
		return {
			ok: true,
			subjectId: payload.subjectId,
			subjectKind: payload.subjectKind,
			holds,
		};
	};
}

function buildLegalHoldListHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("legal-hold-list");
		const query =
			ctx.query && typeof ctx.query.subjectId === "string" && typeof ctx.query.subjectKind === "string"
				? { subjectId: ctx.query.subjectId, subjectKind: ctx.query.subjectKind }
				: normalizeLegalHoldLookup(await (ctx.request.json?.() ?? Promise.resolve(null)));
		if (!query) {
			return createErrorResponse("Invalid legal hold lookup payload", "INVALID_LEGAL_HOLD_QUERY");
		}
		const engine = engineAccessor();
		const holds = await engine.getLegalHolds({ subjectId: query.subjectId, subjectKind: query.subjectKind });
		return {
			ok: true,
			subjectId: query.subjectId,
			subjectKind: query.subjectKind,
			holds,
		};
	};
}

function buildLegalHoldRevokeHandler(engineAccessor: GdprEngineAccessor, moduleEnabled: () => boolean): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) return disabledPayload("legal-hold-revoke");
		const query =
			ctx.query && typeof ctx.query.subjectId === "string" && typeof ctx.query.subjectKind === "string"
				? { subjectId: ctx.query.subjectId, subjectKind: ctx.query.subjectKind }
				: normalizeLegalHoldLookup(await (ctx.request.json?.() ?? Promise.resolve(null)));
		if (!query) {
			return createErrorResponse("Invalid legal hold revoke payload", "INVALID_LEGAL_HOLD_QUERY");
		}
		const engine = engineAccessor();
		await engine.clearLegalHolds({ subjectId: query.subjectId, subjectKind: query.subjectKind });
		return {
			ok: true,
			subjectId: query.subjectId,
			subjectKind: query.subjectKind,
		};
	};
}

function getPluginCollections(host: CommerceHost): {
	consent?: GdprStorageCollection<GdprConsentRecord>;
	legalHold?: GdprStorageCollection<GdprLegalHoldRecord>;
	request?: GdprStorageCollection<GdprRequestRecord>;
	operation?: GdprStorageCollection<GdprOperationRecord>;
	audit?: GdprStorageCollection<GdprAuditLogRecord>;
	exports?: GdprStorageCollection<GdprExportRecord>;
} {
	return {
		consent: host.storage.collections?.["dc_gdpr_consents"] as
			| GdprStorageCollection<GdprConsentRecord>
			| undefined,
		legalHold: host.storage.collections?.["dc_gdpr_legal_holds"] as
			| GdprStorageCollection<GdprLegalHoldRecord>
			| undefined,
		request: host.storage.collections?.["dc_gdpr_requests"] as
			| GdprStorageCollection<GdprRequestRecord>
			| undefined,
		operation: host.storage.collections?.["dc_gdpr_operations"] as
			| GdprStorageCollection<GdprOperationRecord>
			| undefined,
		audit: host.storage.collections?.["dc_gdpr_audit_log"] as
			| GdprStorageCollection<GdprAuditLogRecord>
			| undefined,
		exports: host.storage.collections?.["dc_gdpr_exports"] as
			| GdprStorageCollection<GdprExportRecord>
			| undefined,
	};
}

function getCoreCollections(host: CommerceHost): CommerceCoreCollections {
	return {
		orders: host.storage.collections?.["orders"] as GdprStorageCollection<CommerceDataRecord> | undefined,
		carts: host.storage.collections?.["carts"] as GdprStorageCollection<CommerceDataRecord> | undefined,
		paymentAttempts: host.storage.collections?.["paymentAttempts"] as
			| GdprStorageCollection<CommerceDataRecord>
			| undefined,
	};
}

export function registerModule(host: CommerceHost): CommerceModuleDefinition {
	const logger = host.logger;
	const moduleEnabled = () => Boolean(host.config.get("modules.gdpr.enabled", false));
	const buildEngine = (collections?: {
		consent?: GdprStorageCollection<GdprConsentRecord>;
		legalHold?: GdprStorageCollection<GdprLegalHoldRecord>;
		request?: GdprStorageCollection<GdprRequestRecord>;
		operation?: GdprStorageCollection<GdprOperationRecord>;
		audit?: GdprStorageCollection<GdprAuditLogRecord>;
		exports?: GdprStorageCollection<GdprExportRecord>;
	}) =>
		new GdprWorkflowEngine({
			consentStore: createConsentStore(collections?.consent),
			legalHoldStore: createLegalHoldStore(collections?.legalHold),
			requestStore: createRequestStore(collections?.request),
			operationStore: createOperationStore(collections?.operation),
			auditStore: createAuditStore(collections?.audit),
			exportStore: createExportStore(collections?.exports),
		});
	let provider = buildCoreProvider();
	let engine = buildEngine();
	const getEngine = () => engine;
	const moduleDefinition: CommerceModuleDefinition = {
		id: gdprModuleManifest.id,
		manifest: gdprModuleManifest,
		health: "pending",
		register: async () => {
			logger.info("[gdpr] register phase", { moduleId: gdprModuleManifest.id });
			host.config.register("modules.gdpr.enabled", {
				type: "boolean",
				default: false,
				label: "Enable GDPR module",
				description: "Enable GDPR workflows and requests.",
			});
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests",
					method: "POST",
					handler: buildRequestCreateHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests/:id",
					method: "GET",
					handler: buildRequestGetHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests",
					method: "GET",
					handler: buildRequestListHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/audit/:id",
					method: "GET",
					handler: buildAuditHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/legal-holds",
					method: "POST",
					handler: buildLegalHoldCreateHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/legal-holds",
					method: "GET",
					handler: buildLegalHoldListHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/legal-holds",
					method: "DELETE",
					handler: buildLegalHoldRevokeHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/export",
					method: "POST",
					handler: buildRequestCreateHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/erase",
					method: "POST",
					handler: buildRequestCreateHandler(getEngine, moduleEnabled, "erasure"),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/rectify",
					method: "POST",
					handler: buildRequestCreateHandler(getEngine, moduleEnabled, "rectification"),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/consent",
					method: "GET",
					handler: buildConsentLookupHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/consent",
					method: "POST",
					handler: buildConsentUpdateHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/consent",
					method: "DELETE",
					handler: buildConsentRevokeHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/consent/check",
					method: "GET",
					handler: buildConsentCheckHandler(getEngine, moduleEnabled),
					requireAuth: true,
				}),
			);

			host.hooks.on("order.created", async (event) => {
				logger.info("[gdpr] hook consumed", { event: event as unknown });
			});
			host.hooks.on("order.paid", async (event) => {
				logger.info("[gdpr] hook consumed", { event: event as unknown });
			});

			host.jobs.register("gdpr:process-request", async (jobCtx) => {
				const requestId = typeof jobCtx?.requestId === "string" ? jobCtx.requestId : undefined;
				if (!requestId) {
					logger.warn("[gdpr] gdpr:process-request missing requestId");
					return;
				}
				const workflowEngine = getEngine();
				const request = await workflowEngine.replayRequest(requestId);
				if (!request) {
					logger.warn("[gdpr] gdpr:process-request request not found", { requestId });
					return;
				}
				logger.info("[gdpr] gdpr:process-request completed", {
					requestId,
					status: request.status,
				});
				return request;
			});

			host.migrations.register(gdprModuleManifest.id, gdprModuleManifest.migrations ?? []);

		},
		init: async () => {
			logger.info("[gdpr] init phase", { moduleId: gdprModuleManifest.id, enabled: moduleEnabled() });
			await Promise.all([
				host.storage.registerCollection("dc_gdpr_requests"),
				host.storage.registerCollection("dc_gdpr_operations"),
				host.storage.registerCollection("dc_gdpr_exports"),
				host.storage.registerCollection("dc_gdpr_audit_log"),
				host.storage.registerCollection("dc_gdpr_consents"),
				host.storage.registerCollection("dc_gdpr_legal_holds"),
				host.storage.registerCollection("dc_gdpr_subject_index"),
			]);
			const pluginCollections = getPluginCollections(host);
			const coreCollections = getCoreCollections(host);
			provider = buildCoreProvider(coreCollections);
			engine = buildEngine(pluginCollections);
			engine.registerProvider(provider);
			host.gdpr?.registerProvider?.(provider);
			if (moduleEnabled()) {
				host.admin.registerSettingsTab?.({ id: "gdpr", label: "GDPR" });
				host.admin.registerOrderPanel?.({ id: "gdpr-order-panel", title: "GDPR Requests" });
			}
		},
		ready: async () => {
			moduleDefinition.health = "ready";
			logger.info("[gdpr] ready phase", {
				moduleId: gdprModuleManifest.id,
				providers: engine.getProviders(),
				manifest: "dashcommerce-core",
			});
		},
		shutdown: async () => {
			logger.info("[gdpr] shutdown phase", { moduleId: gdprModuleManifest.id });
		},
	};

	return moduleDefinition;
}

export { buildCoreProvider as createCoreProvider };
export default registerModule;
