import { gdprModuleManifest, type GdprModuleManifest } from "../manifest.js";
import type {
	GdprDataSubject,
	GdprOperationAction,
	GdprOperationResult,
	GdprPersonalData,
	GdprPersonalDataProvider,
	GdprRight,
	GdprProviderManifest,
	GdprThirdPartyProviderBundle,
} from "./types.js";

type GdprHandler = (
	ctx: {
		request: { method: string; json?: () => Promise<unknown> };
		params?: Record<string, string>;
	} & Record<string, unknown>,
) => Promise<unknown>;
type ModuleLifecycle = () => Promise<void> | void;
type ProviderRegistration = GdprPersonalDataProvider | GdprThirdPartyProviderBundle;
type RegisteredProvider = {
	provider: GdprPersonalDataProvider;
	manifest?: GdprProviderManifest;
};

type RouteInput = {
	path: string;
	method: "GET" | "POST";
	handler: GdprHandler;
	requireAuth: boolean;
	enabledByDefault?: boolean;
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

function asRoute(route: RouteInput) {
	return route;
}

function nowToken(prefix: string): string {
	return `${prefix}_${Date.now()}`;
}

function moduleDisabledPayload(operation: string) {
	return {
		ok: false,
		enabled: false,
		operation,
		reason: "GDPR module is currently disabled",
	};
}

function guardedHandler(moduleEnabled: () => boolean, handler: GdprHandler): GdprHandler {
	return async (ctx) => {
		if (!moduleEnabled()) {
			return moduleDisabledPayload("guarded-route");
		}
		return handler(ctx);
	};
}

function buildHealthHandler(manifest: GdprModuleManifest): GdprHandler {
	return async () => ({
		ok: true,
		moduleId: manifest.id,
		version: manifest.version,
		capabilities: manifest.capabilities,
	});
}

function buildReviewSubmitHandler(): GdprHandler {
	return async (_ctx) => ({
		requestId: nowToken("req"),
		status: "queued",
	});
}

function buildRequestListHandler(): GdprHandler {
	return async () => ({
		total: 0,
		requests: [],
		nextCursor: null,
	});
}

function buildRequestRetryHandler(): GdprHandler {
	return async (ctx) => ({
		requestId: nowToken(`req_${ctx.params?.id ?? "item"}`),
		retried: true,
	});
}

function buildRequestReviewHandler(): GdprHandler {
	return async (_ctx) => ({
		updated: true,
		status: "queued",
	});
}

function buildRequestCancelHandler(): GdprHandler {
	return async (_ctx) => ({
		cancelled: true,
	});
}

function buildRequestDownloadHandler(): GdprHandler {
	return async (_ctx) => ({
		downloadUrl: "/gdpr/exports/latest.json",
		expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
	});
}

function buildProviderTestHandler(): GdprHandler {
	return async (ctx) => ({
		providerId: ctx.params?.id ?? "unknown",
		pingedAt: new Date().toISOString(),
		ok: true,
	});
}

function buildAuditLookupHandler(): GdprHandler {
	return async () => ({
		events: [],
		total: 0,
	});
}

function buildConsentGetHandler(): GdprHandler {
	return async () => ({
		hasConsent: false,
		subjectKind: "user",
		consents: [],
	});
}

function buildConsentSetHandler(): GdprHandler {
	return async (ctx) => {
		const body = await (ctx.request.json?.() ?? Promise.resolve({}));
		return {
			saved: true,
			body,
		};
	};
}

function buildPrivacyExportHandler(): GdprHandler {
	return async () => ({
		exportId: nowToken("privacy_export"),
		status: "queued",
	});
}

function buildPrivacyEraseHandler(): GdprHandler {
	return async () => ({
		jobId: nowToken("privacy_erase"),
		status: "queued",
		requestId: nowToken("req"),
	});
}

function buildPrivacyRectifyHandler(): GdprHandler {
	return async () => ({
		jobId: nowToken("privacy_rectify"),
		status: "queued",
		requestId: nowToken("req"),
	});
}

function buildProviderDiscoveryHandler(): GdprHandler {
	return async (_ctx) => ({
		subjects: [],
		discoveredAt: new Date().toISOString(),
	});
}

function buildRequestGetHandler(): GdprHandler {
	return async (_ctx) => ({
		id: nowToken("req"),
		right: "access" satisfies GdprRight,
		status: "pending",
	});
}

function buildProviderListHandler(providerRegistry: Map<string, RegisteredProvider>): GdprHandler {
	return async () => ({
		providers: Array.from(providerRegistry.values()).map(({ provider, manifest }) => ({
			providerId: provider.id,
			name: provider.name,
			manifest: manifest ?? null,
		})),
	});
}

function buildExportPayload(subject: GdprDataSubject): GdprPersonalData {
	return {
		providerId: "dashcommerce-core",
		kind: "snapshot",
		records: [
			{
				id: subject.subjectId,
				fields: {
					subjectId: subject.subjectId,
					subjectKind: subject.subjectKind,
				},
			},
		],
		metadata: {
			extractedAt: new Date().toISOString(),
		},
	};
}

function buildOperationResult(action: GdprOperationAction): GdprOperationResult {
	return {
		providerId: "dashcommerce-core",
		action,
		status: "success",
		processed: 1,
		requestIdempotencyKey: nowToken("op"),
		message: "skeleton",
	};
}

export function registerModule(host: CommerceHost): CommerceModuleDefinition {
	const logger = host.logger;
	const moduleEnabled = () => Boolean(host.config.get("modules.gdpr.enabled", false));

	const providerRegistry = new Map<string, RegisteredProvider>();

	function normalizeProviderRegistration(input: ProviderRegistration): RegisteredProvider {
		if ("provider" in input) {
			return input;
		}
		return { provider: input };
	}

	function registerProvider(registration: ProviderRegistration): void {
		const normalized = normalizeProviderRegistration(registration);
		const { provider, manifest } = normalized;

		if (manifest && manifest.providerId !== provider.id) {
			logger.warn("[gdpr] provider manifest id mismatch", { providerId: provider.id, manifestId: manifest.providerId });
			return;
		}

		if (providerRegistry.has(provider.id)) {
			logger.warn("[gdpr] duplicate provider ignored", { providerId: provider.id });
			return;
		}
		providerRegistry.set(provider.id, normalized);
		host.gdpr?.registerProvider?.(provider);

		if (manifest) {
			logger.info("[gdpr] registered provider manifest", {
				providerId: provider.id,
				author: manifest.author,
				riskLevel: manifest.riskLevel,
			});
		}
	}

	host.gdpr?.registerProvider &&
		logger.info("[gdpr] registering provider surface is supported by host", {
			moduleId: gdprModuleManifest.id,
		});

	const moduleDefinition: CommerceModuleDefinition = {
		id: gdprModuleManifest.id,
		manifest: gdprModuleManifest,
		health: "pending",
		register: () => {
			logger.info("[gdpr] register phase", { moduleId: gdprModuleManifest.id });
			host.config.register("modules.gdpr.enabled", {
				type: "boolean",
				default: false,
				label: "Enable GDPR module",
				description: "Enable GDPR workflows and routes.",
			});
			if (!moduleEnabled()) {
				logger.info("[gdpr] module disabled; skipping runtime registration", {
					moduleId: gdprModuleManifest.id,
				});
				return;
			}
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/health",
					method: "GET",
					handler: guardedHandler(moduleEnabled, buildHealthHandler(gdprModuleManifest)),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildReviewSubmitHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests/:id",
					method: "GET",
					handler: guardedHandler(moduleEnabled, buildRequestGetHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests/:id/retry",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildRequestRetryHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests",
					method: "GET",
					handler: guardedHandler(moduleEnabled, buildRequestListHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests/:id/review",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildRequestReviewHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests/:id/cancel",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildRequestCancelHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/requests/:id/download",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildRequestDownloadHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/providers/:id/test",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildProviderTestHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/providers",
					method: "GET",
					handler: guardedHandler(moduleEnabled, buildProviderListHandler(providerRegistry)),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/subjects",
					method: "GET",
					handler: guardedHandler(moduleEnabled, buildProviderDiscoveryHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/admin/api/gdpr/audit/:id",
					method: "GET",
					handler: guardedHandler(moduleEnabled, buildAuditLookupHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/export",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildPrivacyExportHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/erase",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildPrivacyEraseHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/rectify",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildPrivacyRectifyHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/consent",
					method: "GET",
					handler: guardedHandler(moduleEnabled, buildConsentGetHandler()),
					requireAuth: true,
				}),
			);
			host.routes.registerRoute?.(
				asRoute({
					path: "/account/privacy/consent",
					method: "POST",
					handler: guardedHandler(moduleEnabled, buildConsentSetHandler()),
					requireAuth: true,
				}),
			);
			host.hooks.on("order.created", async (event) => {
				logger.info("[gdpr] hook consumed", { event });
			});
			host.hooks.on("order.payment_pending", async (event) => {
				logger.info("[gdpr] hook consumed", { event });
			});
			host.hooks.on("order.paid", async (event) => {
				logger.info("[gdpr] hook consumed", { event });
			});
			host.hooks.on("checkout.completed", async (event) => {
				logger.info("[gdpr] hook consumed", { event });
			});
			host.hooks.on("cart.upserted", async (event) => {
				logger.info("[gdpr] hook consumed", { event });
			});
			host.migrations.register(gdprModuleManifest.id, ["0001_create_gdpr_tables"]);
			host.jobs.register("gdpr:process-request", async (_jobCtx) => {
				logger.info("[gdpr] job called");
			});
		},
		init: async () => {
			if (!moduleEnabled()) {
				logger.info("[gdpr] init skipped; module disabled", { moduleId: gdprModuleManifest.id });
				return;
			}
			logger.info("[gdpr] init phase", {
				moduleId: gdprModuleManifest.id,
			});
			await Promise.all([
				host.storage.registerCollection("dc_gdpr_requests"),
				host.storage.registerCollection("dc_gdpr_operations"),
				host.storage.registerCollection("dc_gdpr_exports"),
				host.storage.registerCollection("dc_gdpr_audit_log"),
			]);
			host.admin.registerSettingsTab?.({ id: "gdpr", label: "GDPR" });
			host.admin.registerOrderPanel?.({ id: "gdpr-order-panel", title: "GDPR Requests" });
		},
		ready: async () => {
			if (!moduleEnabled()) {
				logger.info("[gdpr] ready skipped; module disabled", { moduleId: gdprModuleManifest.id });
				return;
			}
			logger.info("[gdpr] ready phase", { moduleId: gdprModuleManifest.id });
			moduleDefinition.health = "ready";
			logger.info("[gdpr] ready payload", {
				requestSnapshot: buildExportPayload({ subjectId: "sample", subjectKind: "user" }),
				operationSnapshot: buildOperationResult("export"),
			});
		},
		shutdown: async () => {
			logger.info("[gdpr] shutdown phase", { moduleId: gdprModuleManifest.id });
		},
	};

	const commerceProvider: GdprPersonalDataProvider = {
		id: "dashcommerce-core",
		name: "DashingCommerce Core Data Provider",
		capabilities: async () => ({
			canAccessExport: true,
			canErase: true,
			canAnonymize: true,
			canRectify: true,
			retentionOverrides: [],
		}),
		discoverSubjects: async () => [],
		exportData: async (subject) => buildExportPayload(subject),
		anonymizeData: async ({ subjectId }) => ({
			providerId: "dashcommerce-core",
			action: "anonymize",
			status: "success",
			processed: 1,
			requestIdempotencyKey: `anonymize_${subjectId}`,
			message: "skeleton",
		}),
		eraseData: async ({ subjectId }) => ({
			providerId: "dashcommerce-core",
			action: "erase",
			status: "success",
			processed: 1,
			requestIdempotencyKey: `erase_${subjectId}`,
			message: "skeleton",
		}),
		rectifyData: async ({ subjectId }) => ({
			providerId: "dashcommerce-core",
			action: "rectify",
			status: "skipped",
			processed: 0,
			requestIdempotencyKey: nowToken(`rectify_${subjectId}`),
			message: "not implemented in scaffold",
		}),
	};

	if (moduleEnabled()) {
		registerProvider({
			provider: commerceProvider,
			manifest: {
				providerId: "dashcommerce-core",
				providerName: "DashingCommerce Core Data Provider",
				author: "DashingCommerce",
				version: "0.1.0",
				summary: "Core commerce-owned data extraction and retention-safe cleanup.",
				supportedRights: ["access", "erasure", "rectification", "restriction", "objection", "portability"],
				sideEffects: ["read-core", "write-module"],
				idempotentByDefault: true,
				riskLevel: "trusted",
				legalBasisHints: ["contract", "legal_obligation", "legitimate_interest"],
				dataSensitivity: "high",
				contactEmail: "privacy@dashingcommerce.example",
			},
		});
	}
	return moduleDefinition;
}

export default registerModule;
