import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { COMMERCE_MANIFEST, withFetch, withKV } from "./commerce-plugin-factory.js";
import { COMMERCE_ROUTE_CAPABILITIES, commercePlugin, createPlugin } from "./index.js";

const ROOT = resolve(import.meta.dirname, ".");
const INDEX_TS_PATH = resolve(ROOT, "index.ts");
const PACKAGE_JSON_PATH = resolve(ROOT, "../package.json");

const ALLOWED_HOSTS_DECLARATION = /\ballowedHosts\s*:/;
const LEGACY_HANDLERS = /\bplugin:activate\b|\bplugin:deactivate\b|\bplugin:install\b/;
const CRON_HOOK_PATTERN = /\["?cron"?\]\s*:\s*async|cron\s*:\s*async/;

function readIndexSource(): string {
	return readFileSync(INDEX_TS_PATH, "utf8");
}

function readPackageJson(): Record<string, unknown> {
	return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as Record<string, unknown>;
}

function getCapabilities(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string");
}

function getKvRouteKeys(): string[] {
	return Object.entries(COMMERCE_ROUTE_CAPABILITIES)
		.filter(([, options]) => options.requiresKV)
		.map(([routeKey]) => routeKey);
}

describe("EmDash guide compliance: manifest contract", () => {
	it("uses a single canonical manifest source", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;

		expect(descriptor.id).toBe(COMMERCE_MANIFEST.id);
		expect(descriptor.version).toBe(COMMERCE_MANIFEST.version);
		expect(descriptor.storage).toBeDefined();
	});

	it("keeps manifest version aligned with package version", () => {
		const pkg = readPackageJson();
		const packageVersion = String(pkg.version ?? "");
		expect(packageVersion).toBe(COMMERCE_MANIFEST.version);
	});

	it("declares every guide-required capability used by this plugin", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;
		const plugin = createPlugin() as unknown as Record<string, unknown>;
		const pluginManifest = (plugin.manifest as { capabilities?: unknown }) ?? {};

		const descriptorCapabilities = getCapabilities(descriptor.capabilities);
		const pluginCapabilities = getCapabilities(pluginManifest.capabilities);

		const expectedCapabilities = ["network:fetch", "storage:kv", "cron:schedule", "admin:ui"];

		expect(descriptorCapabilities).toEqual(expect.arrayContaining(expectedCapabilities));
		expect(pluginCapabilities).toEqual(expect.arrayContaining(expectedCapabilities));
	});

	it("uses guide-shaped network policy via network.allowedHostnames", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;
		const plugin = createPlugin() as unknown as Record<string, unknown>;
		const pluginManifest = (plugin.manifest as { network?: { allowedHostnames?: unknown } }) ?? {};

		const descriptorNetwork = descriptor.network as { allowedHostnames?: unknown } | undefined;
		const pluginNetwork = pluginManifest.network as { allowedHostnames?: unknown } | undefined;

		expect(descriptorNetwork?.allowedHostnames).toBeDefined();
		expect(pluginNetwork?.allowedHostnames).toBeDefined();
		expect(Array.isArray(descriptorNetwork?.allowedHostnames)).toBe(true);
		expect(Array.isArray(pluginNetwork?.allowedHostnames)).toBe(true);
	});

	it("does not rely on legacy allowedHosts manifest fields", () => {
		const source = readIndexSource();
		expect(source).not.toMatch(ALLOWED_HOSTS_DECLARATION);
	});

	it("uses explicit hostnames only and never wildcard hosts", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;
		const plugin = createPlugin() as unknown as Record<string, unknown>;
		const pluginManifest = (plugin.manifest as { network?: { allowedHostnames?: unknown } }) ?? {};

		const descriptorHostnames = ((descriptor.network as { allowedHostnames?: unknown } | undefined)?.allowedHostnames ??
			[]) as unknown[];
		const pluginHostnames = ((pluginManifest.network as { allowedHostnames?: unknown } | undefined)?.allowedHostnames ??
			[]) as unknown[];

		for (const hostname of [...descriptorHostnames, ...pluginHostnames]) {
			expect(typeof hostname).toBe("string");
			expect(String(hostname)).not.toContain("*");
		}
	});

	it("keeps descriptor and runtime manifest fields aligned", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;
		const plugin = createPlugin() as unknown as { manifest?: Record<string, unknown> };

		expect(descriptor.id).toBe(plugin.manifest?.id);
		expect(descriptor.version).toBe(plugin.manifest?.version);
		expect(descriptor.capabilities).toEqual(plugin.manifest?.capabilities);
		expect(descriptor.network).toEqual(plugin.manifest?.network);
	});

	it("fails fast when activation runs without cron capability", async () => {
		const plugin = createPlugin() as unknown as {
			onActivate?: (ctx: Record<string, unknown>) => Promise<unknown>;
			onInstall?: (ctx: Record<string, unknown>) => Promise<unknown>;
			onDeactivate?: (ctx: Record<string, unknown>) => Promise<unknown>;
		};

		const requiredCtx = {
			kv: {},
			http: { fetch: vi.fn() },
		} as Record<string, unknown>;

		await expect(plugin.onActivate?.(requiredCtx)).rejects.toThrow("Cron capability missing");
		await expect(plugin.onInstall?.(requiredCtx)).resolves.toBeUndefined();
		await expect(plugin.onDeactivate?.(requiredCtx)).resolves.toBeUndefined();
	});
});

describe("EmDash guide compliance: source-level contract", () => {
	it("imports compliance factory helpers via documented paths", () => {
		const source = readIndexSource();

		expect(source).toContain("createCommercePlugin");
		expect(source).toContain("COMMERCE_MANIFEST");
		expect(source).toContain('from "emdash/plugin"');
		expect(source).not.toContain('from "emdash"');
	});

	it("does not use undocumented plugin:activate lifecycle keys", () => {
		const source = readIndexSource();
		expect(source).not.toContain('"plugin:activate"');
	});

	it("exposes guide-documented lifecycle handlers instead", () => {
		const source = readIndexSource();
		expect(source).toContain("onInstall");
		expect(source).toContain("onActivate");
		expect(source).toContain("onDeactivate");
		expect(source).not.toMatch(LEGACY_HANDLERS);
	});

	it("keeps runtime cron scheduling in the legacy hooks map", () => {
		const source = readIndexSource();
		expect(source).toContain("hooks");
		expect(source).toMatch(CRON_HOOK_PATTERN);
	});

	it("enforces route capability precision without fetch by default", async () => {
		const withoutFetch = withKV(async (_ctx: unknown) => "ok");
		const withFetchRoute = withFetch(async (_ctx: unknown) => "ok");

		const withNoFetch = withoutFetch;
		const withFetchHandler = withFetchRoute;
		expect(withNoFetch).toBeTypeOf("function");
		expect(withFetchHandler).toBeTypeOf("function");

		await expect(
			withNoFetch({
				kv: {},
				request: new Request("https://example.test/test-route", { method: "POST" }),
				storage: {},
			} as Record<string, unknown>),
		).resolves.toBe("ok");

		await expect(
			withFetchHandler({
				kv: {},
				request: new Request("https://example.test/test-route-fetch", { method: "POST" }),
				storage: {},
			} as Record<string, unknown>),
		).rejects.toMatchObject({ message: "[CommercePlugin] Fetch capability missing" });
	});

	it("enforces KV capability only on declared KV-dependent routes", async () => {
		const plugin = createPlugin() as {
			routes: Record<string, { handler?: unknown }>;
		};

		const routes = plugin.routes ?? {};
		const storageBackedRoutes = getKvRouteKeys();

		for (const routeKey of storageBackedRoutes) {
			const route = routes[routeKey];
			expect(route).toBeDefined();
			expect(route?.handler).toBeTypeOf("function");
			const handler = route?.handler;
			await expect(
				(handler as (_ctx: Record<string, unknown>) => Promise<unknown>)({
					request: new Request(`https://example.test/${routeKey}`),
					storage: {},
				}),
			).rejects.toMatchObject({ message: "[CommercePlugin] KV capability missing" });
		}
	});

	it("derives runtime KV checks from explicit route capability metadata", () => {
		const routeKeysWithFetch = Object.entries(COMMERCE_ROUTE_CAPABILITIES)
			.filter(([, options]) => options.requiresFetch)
			.map(([routeKey]) => routeKey);
		expect(routeKeysWithFetch).toHaveLength(0);

		const plugin = createPlugin() as {
			routes: Record<string, { handler?: unknown }>;
		};

		const kvRouteKeys = getKvRouteKeys().sort();
		const pluginRouteKeys = Object.keys(plugin.routes ?? {}).sort();
		expect(kvRouteKeys).toEqual(["cart/upsert", "checkout", "webhooks/stripe"].sort());
		for (const routeKey of kvRouteKeys) {
			expect(pluginRouteKeys).toContain(routeKey);
		}
	});
});

describe("EmDash guide compliance: package contract", () => {
	it("does not use workspace:* as the external emdash peer dependency", () => {
		const pkg = readPackageJson();
		const peerDependencies = (pkg.peerDependencies ?? {}) as Record<string, unknown>;
		const emdashPeer = peerDependencies.emdash;

		expect(emdashPeer).toBeTypeOf("string");
		expect(String(emdashPeer)).not.toBe("workspace:*");
		expect(String(emdashPeer)).not.toBe("latest");
		expect(String(emdashPeer)).not.toBe("*");
	});
});
