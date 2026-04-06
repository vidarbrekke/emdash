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

type GdprHandler = (ctx: { request: { method: string } } & Record<string, unknown>) => Promise<unknown>;
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
		requestId: `req_${Date.now()}`,
		status: "queued",
	});
}

function buildRequestRetryHandler(): GdprHandler {
	return async (_ctx) => ({
		requestId: "unknown",
		retried: true,
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
		id: "unknown",
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
		requestIdempotencyKey: `op_${Date.now()}`,
		message: "skeleton",
	};
}

export function registerModule(host: CommerceHost): CommerceModuleDefinition {
	const logger = host.logger;

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
			});
			host.routes.registerAdminRoute(
				asRoute({
					path: "/gdpr/health",
					method: "GET",
					handler: buildHealthHandler(gdprModuleManifest),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/gdpr/requests",
					method: "POST",
					handler: buildReviewSubmitHandler(),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/gdpr/requests/:id",
					method: "GET",
					handler: buildRequestGetHandler(),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/gdpr/requests/:id/retry",
					method: "POST",
					handler: buildRequestRetryHandler(),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/gdpr/providers/:id/test",
					method: "POST",
					handler: buildProviderDiscoveryHandler(),
					requireAuth: true,
				}),
			);
			host.routes.registerAdminRoute(
				asRoute({
					path: "/gdpr/providers",
					method: "GET",
					handler: buildProviderListHandler(providerRegistry),
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
			canRectify: false,
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
	};

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
	return moduleDefinition;
}

export default registerModule;
