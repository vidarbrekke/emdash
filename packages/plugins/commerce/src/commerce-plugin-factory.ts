/**
 * packages/plugins/commerce/src/commerce-plugin-factory.ts
 *
 * Commerce plugin factory with enforced manifest and runtime invariants.
 */

import type {
	HttpAccess,
	PluginContext,
	PluginRoute,
	PluginStorageConfig,
	RouteContext,
} from "emdash/plugin";

const PROTOCOL_PREFIX = /^https?:\/\//;

export type CommerceCapability =
	| "network:fetch"
	| "storage:kv"
	| "cron:schedule"
	| "admin:ui";

export type CommerceManifest = {
	id: "commerce";
	version: string;
	capabilities: readonly CommerceCapability[];
	network: {
		allowedHostnames: readonly string[];
	};
};

export const COMMERCE_MANIFEST = Object.freeze({
	id: "commerce",
	version: "0.1.0",
	capabilities: [
		"network:fetch",
		"storage:kv",
		"cron:schedule",
		"admin:ui",
	],
	network: {
		allowedHostnames: ["api.stripe.com"],
	},
} as const satisfies CommerceManifest);

export type CommercePluginContext = PluginContext<PluginStorageConfig>;

export type CommerceRouteHandler = (ctx: RouteContext<unknown>, ...args: unknown[]) => Promise<unknown>;

export type CommerceRouteEntry = CommerceRouteHandler | PluginRoute<unknown>;

export type CommerceLifecycleHandler = (ctx: CommercePluginContext, ...args: unknown[]) => Promise<unknown>;

export type CommercePluginDefinition = {
	manifest?: CommerceManifest;
	storage?: PluginStorageConfig;
	onInstall?: CommerceLifecycleHandler;
	onActivate?: CommerceLifecycleHandler;
	onDeactivate?: CommerceLifecycleHandler;
	hooks?: Record<string, unknown>;
	routes?: Record<string, CommerceRouteEntry>;
	admin?: {
		settingsSchema?: unknown;
	};
};

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(`[CommercePlugin] ${message}`);
	}
}

function validateNetworkPolicy(hosts: readonly string[]): void {
	assert(Array.isArray(hosts), "network.allowedHostnames must be an array");
	assert(hosts.length > 0, "network.allowedHostnames cannot be empty");

	for (const host of hosts) {
		assert(typeof host === "string" && host.length > 0, "Hostname must be a non-empty string");
		assert(!host.includes("*"), `Wildcard host forbidden: ${host}`);
		assert(!PROTOCOL_PREFIX.test(host), `Host must not include protocol: ${host}`);
		assert(!host.includes("/"), `Host must not include path: ${host}`);
	}
}

function validateManifest(manifest: CommerceManifest): void {
	assert(manifest.id === "commerce", 'Manifest id must be "commerce"');
	assert(typeof manifest.version === "string" && manifest.version.length > 0, "Manifest version is required");

	const required: CommerceCapability[] = [
		"network:fetch",
		"storage:kv",
		"cron:schedule",
		"admin:ui",
	];

	for (const capability of required) {
		assert(manifest.capabilities.includes(capability), `Missing required capability: ${capability}`);
	}

	validateNetworkPolicy(manifest.network.allowedHostnames);
}

export function requireKV<T = unknown>(ctx: CommercePluginContext): T {
	assert(ctx.kv, "KV capability missing");
	return ctx.kv as T;
}

export function optionalCron(ctx: CommercePluginContext): CommercePluginContext["cron"] {
	return ctx.cron;
}

export function requireCron(ctx: CommercePluginContext): NonNullable<CommercePluginContext["cron"]> {
	const cron = optionalCron(ctx);
	assert(cron, "Cron capability missing");
	return cron;
}

export function requireFetch(ctx: CommercePluginContext): HttpAccess["fetch"] {
	const maybeFetch = ctx.http?.fetch;
	assert(typeof maybeFetch === "function", "Fetch capability missing");
	return maybeFetch;
}

type RouteGuardOptions = {
	requireKV?: boolean;
	requireFetch?: boolean;
	requireCron?: boolean;
};

function wrapRoute(handler: CommerceRouteHandler, options: RouteGuardOptions = {}): CommerceRouteHandler {
	return async (ctx, ...args) => {
		if (options.requireKV ?? false) {
			requireKV(ctx);
		}
		if (options.requireFetch) {
			requireFetch(ctx);
		}
		if (options.requireCron) {
			requireCron(ctx);
		}
		return await handler(ctx, ...args);
	};
}

function wrapRouteEntry(
	entry: CommerceRouteHandler | CommerceRouteEntry,
	options: RouteGuardOptions = {},
): CommerceRouteEntry {
	if (typeof entry === "function") {
		return wrapRoute(entry, options);
	}
	return {
		...entry,
		handler: wrapRoute(entry.handler as CommerceRouteHandler, options),
	} as CommerceRouteEntry;
}

export function withKV<T extends CommerceRouteEntry>(entry: T): T {
	return wrapRouteEntry(entry, { requireKV: true }) as T;
}

export function withFetch<T extends CommerceRouteEntry>(entry: T): T {
	return wrapRouteEntry(entry, { requireKV: true, requireFetch: true }) as T;
}

function wrapLifecycle(
	handler: CommerceLifecycleHandler | undefined,
	options: RouteGuardOptions = {},
): CommerceLifecycleHandler | undefined {
	if (!handler) return undefined;
	return async (ctx) => {
		if (options.requireKV ?? false) {
			requireKV(ctx);
		}
		if (options.requireFetch ?? false) {
			requireFetch(ctx);
		}
		if (options.requireCron ?? false) {
			requireCron(ctx);
		}
		return handler(ctx);
	};
}

function normalizeRouteEntry(entry: CommerceRouteEntry): CommerceRouteEntry {
	if (typeof entry === "function") {
		return wrapRoute(entry);
	}
	return entry;
}

export function createCommercePlugin(definition: CommercePluginDefinition) {
	const manifest = definition.manifest ?? COMMERCE_MANIFEST;
	validateManifest(manifest);

	const wrappedRoutes = Object.fromEntries(
		Object.entries(definition.routes ?? {}).map(([key, handler]) => [key, normalizeRouteEntry(handler)]),
	);

	return Object.freeze({
		manifest,
		onInstall: wrapLifecycle(definition.onInstall, {}),
		onActivate: wrapLifecycle(definition.onActivate, { requireCron: true }),
		onDeactivate: wrapLifecycle(definition.onDeactivate, {}),
		hooks: definition.hooks,
		storage: definition.storage,
		routes: wrappedRoutes,
		admin: definition.admin,
	});
}

export function validateCommerceRuntime(ctx: CommercePluginContext): void {
	requireCron(ctx);
	validateManifest(COMMERCE_MANIFEST);
}
