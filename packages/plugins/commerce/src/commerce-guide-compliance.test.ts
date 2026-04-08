import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { commercePlugin, createPlugin } from "./index.js";

const ROOT = resolve(import.meta.dirname, ".");
const INDEX_TS_PATH = resolve(ROOT, "index.ts");
const PACKAGE_JSON_PATH = resolve(ROOT, "../package.json");

const ALLOWED_HOSTS_DECLARATION = /\ballowedHosts\s*:/;
const LEGACY_HANDLERS = /\bonInstall\b|\bonActivate\b|\bonDeactivate\b|\bonRequest\b/;
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

describe("EmDash guide compliance: manifest contract", () => {
	it("declares every guide-required capability used by this plugin", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;
		const plugin = createPlugin() as unknown as Record<string, unknown>;

		const descriptorCapabilities = getCapabilities(descriptor.capabilities);
		const pluginCapabilities = getCapabilities(plugin.capabilities);

		const expectedCapabilities = ["network:fetch", "storage:kv", "cron:schedule", "admin:ui"];

		expect(descriptorCapabilities).toEqual(expect.arrayContaining(expectedCapabilities));
		expect(pluginCapabilities).toEqual(expect.arrayContaining(expectedCapabilities));
	});

	it("uses guide-shaped network policy via network.allowedHostnames", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;
		const plugin = createPlugin() as unknown as Record<string, unknown>;

		const descriptorNetwork = descriptor.network as { allowedHostnames?: unknown } | undefined;
		const pluginNetwork = plugin.network as { allowedHostnames?: unknown } | undefined;

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

		const descriptorHostnames = ((descriptor.network as { allowedHostnames?: unknown } | undefined)?.allowedHostnames ??
			[]) as unknown[];
		const pluginHostnames = ((plugin.network as { allowedHostnames?: unknown } | undefined)?.allowedHostnames ??
			[]) as unknown[];

		for (const hostname of [...descriptorHostnames, ...pluginHostnames]) {
			expect(typeof hostname).toBe("string");
			expect(String(hostname)).not.toContain("*");
		}
	});

	it("keeps descriptor and runtime manifest fields aligned", () => {
		const descriptor = commercePlugin() as Record<string, unknown>;
		const plugin = createPlugin() as unknown as Record<string, unknown>;

		expect(descriptor.id).toBe(plugin.id);
		expect(descriptor.version).toBe(plugin.version);
		expect(descriptor.capabilities).toEqual(plugin.capabilities);
		expect(descriptor.network).toEqual(plugin.network);
	});
});

describe("EmDash guide compliance: source-level contract", () => {
	it("imports definePlugin from emdash/plugin", () => {
		const source = readIndexSource();

		expect(source).toContain("from \"emdash/plugin\"");
		expect(source).not.toContain('from "emdash"');
	});

	it("does not use undocumented plugin:activate lifecycle keys", () => {
		const source = readIndexSource();
		expect(source).not.toContain('"plugin:activate"');
	});

	it("exposes guide-documented lifecycle handlers instead", () => {
		const source = readIndexSource();
		expect(source).toMatch(LEGACY_HANDLERS);
	});

	it("keeps runtime cron scheduling in the legacy hooks map", () => {
		const source = readIndexSource();
		expect(source).toContain("hooks");
		expect(source).toMatch(CRON_HOOK_PATTERN);
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
