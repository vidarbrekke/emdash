/**
 * Marketplace handler tests
 *
 * Tests the business logic for:
 * - Install (handleMarketplaceInstall)
 * - Update (handleMarketplaceUpdate)
 * - Uninstall (handleMarketplaceUninstall)
 * - Update check (handleMarketplaceUpdateCheck)
 * - Search/GetPlugin proxies (handleMarketplaceSearch, handleMarketplaceGetPlugin)
 *
 * Uses a real in-memory SQLite database and mock Storage/SandboxRunner/fetch.
 */

import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	handleMarketplaceInstall,
	handleMarketplacePricing,
	handleMarketplaceInstallConfirm,
	handleMarketplaceUpdate,
	handleMarketplaceUninstall,
	handleMarketplaceUpdateCheck,
	handleMarketplaceSearch,
	handleMarketplaceGetPlugin,
} from "../../../src/api/handlers/marketplace.js";
import { runMigrations } from "../../../src/database/migrations/runner.js";
import type { Database as DbSchema } from "../../../src/database/types.js";
import type { MarketplacePluginDetail } from "../../../src/plugins/marketplace.js";
import type { SandboxRunner, SandboxedPlugin } from "../../../src/plugins/sandbox/types.js";
import { PluginStateRepository } from "../../../src/plugins/state.js";
import type { PluginManifest } from "../../../src/plugins/types.js";
import type {
	Storage,
	UploadResult,
	DownloadResult,
	ListResult,
	SignedUploadUrl,
} from "../../../src/storage/types.js";

// ── Mock factories ────────────────────────────────────────────────

function createMockStorage(): Storage {
	const store = new Map<string, { body: Uint8Array; contentType: string }>();

	return {
		async upload(opts: {
			key: string;
			body: Buffer | Uint8Array | ReadableStream<Uint8Array>;
			contentType: string;
		}): Promise<UploadResult> {
			let body: Uint8Array;
			if (opts.body instanceof Uint8Array) {
				body = opts.body;
			} else if (Buffer.isBuffer(opts.body)) {
				body = new Uint8Array(opts.body);
			} else {
				// ReadableStream
				const response = new Response(opts.body);
				body = new Uint8Array(await response.arrayBuffer());
			}
			store.set(opts.key, { body, contentType: opts.contentType });
			return { key: opts.key, url: `https://storage.test/${opts.key}`, size: body.length };
		},
		async download(key: string): Promise<DownloadResult> {
			const item = store.get(key);
			if (!item) throw new Error(`Not found: ${key}`);
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(item.body);
					controller.close();
				},
			});
			return { body: stream, contentType: item.contentType, size: item.body.length };
		},
		async delete(key: string): Promise<void> {
			store.delete(key);
		},
		async exists(key: string): Promise<boolean> {
			return store.has(key);
		},
		async list(): Promise<ListResult> {
			return { files: [] };
		},
		async getSignedUploadUrl(): Promise<SignedUploadUrl> {
			return {
				url: "https://test.com/upload",
				method: "PUT",
				headers: {},
				expiresAt: new Date().toISOString(),
			};
		},
		getPublicUrl(key: string): string {
			return `https://storage.test/${key}`;
		},
	};
}

function createMockSandboxRunner(): SandboxRunner & {
	loadedPlugins: Array<{ manifest: PluginManifest; code: string }>;
} {
	const loadedPlugins: Array<{ manifest: PluginManifest; code: string }> = [];

	return {
		loadedPlugins,
		isAvailable(): boolean {
			return true;
		},
		async load(manifest: PluginManifest, code: string): Promise<SandboxedPlugin> {
			loadedPlugins.push({ manifest, code });
			return {
				id: manifest.id,
				manifest,
				async invokeHook() {
					return undefined;
				},
				async invokeRoute() {
					return undefined;
				},
				async terminate() {},
			};
		},
		async terminateAll() {},
	};
}

const MARKETPLACE_URL = "https://marketplace.example.com";

function mockManifest(id = "test-seo", version = "1.0.0"): PluginManifest {
	return {
		id,
		version,
		capabilities: ["read:content"],
		allowedHosts: [],
		storage: {},
		hooks: [],
		routes: [],
		admin: {},
	};
}

/**
 * Create a gzipped tar bundle for use with mocked fetch.
 * Uses CompressionStream + minimal tar format.
 */
async function createMockBundle(manifest: PluginManifest): Promise<Uint8Array> {
	const encoder = new TextEncoder();
	const manifestJson = JSON.stringify(manifest);
	const backendCode = 'export default function() { return "hello"; }';

	// Create simple tar
	const files = [
		{ name: "manifest.json", content: manifestJson },
		{ name: "backend.js", content: backendCode },
	];

	const blocks: Uint8Array[] = [];

	for (const file of files) {
		const contentBytes = encoder.encode(file.content);
		const header = new Uint8Array(512);

		// Name
		header.set(encoder.encode(file.name), 0);
		// Mode
		header.set(encoder.encode("0000644\0"), 100);
		// UID/GID
		header.set(encoder.encode("0000000\0"), 108);
		header.set(encoder.encode("0000000\0"), 116);
		// Size in octal
		const sizeOctal = contentBytes.length.toString(8).padStart(11, "0") + "\0";
		header.set(encoder.encode(sizeOctal), 124);
		// Mtime
		header.set(encoder.encode("00000000000\0"), 136);
		// Type = regular file
		header[156] = 0x30;
		// Checksum spaces
		header.set(encoder.encode("        "), 148);

		let checksum = 0;
		for (let i = 0; i < 512; i++) checksum += header[i]!;
		header.set(encoder.encode(checksum.toString(8).padStart(6, "0") + "\0 "), 148);

		blocks.push(header);

		const paddedSize = Math.ceil(contentBytes.length / 512) * 512;
		const dataBlock = new Uint8Array(paddedSize);
		dataBlock.set(contentBytes, 0);
		blocks.push(dataBlock);
	}

	blocks.push(new Uint8Array(1024)); // end-of-archive

	const totalSize = blocks.reduce((sum, b) => sum + b.length, 0);
	const tar = new Uint8Array(totalSize);
	let offset = 0;
	for (const block of blocks) {
		tar.set(block, offset);
		offset += block.length;
	}

	// Gzip
	const cs = new CompressionStream("gzip");
	const writer = cs.writable.getWriter();
	const reader = cs.readable.getReader();

	const writePromise = writer.write(tar).then(() => writer.close());
	const chunks: Uint8Array[] = [];
	let totalLen = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		totalLen += value.length;
	}
	await writePromise;

	const result = new Uint8Array(totalLen);
	offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

function mockPluginDetail(
	id = "test-seo",
	latestVersion = "1.0.0",
	checksum?: string,
): MarketplacePluginDetail {
	return {
		id,
		name: "Test SEO",
		description: "SEO plugin",
		author: { name: "Test", verified: true, avatarUrl: null },
		capabilities: ["hooks"],
		keywords: [],
		installCount: 10,
		hasIcon: false,
		iconUrl: "",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-02-01T00:00:00Z",
		repositoryUrl: null,
		homepageUrl: null,
		license: "MIT",
		latestVersion: {
			version: latestVersion,
			minEmDashVersion: null,
			bundleSize: 1234,
			checksum: checksum ?? "will-be-computed",
			changelog: null,
			readme: null,
			hasIcon: false,
			screenshotCount: 0,
			screenshotUrls: [],
			capabilities: ["hooks"],
			auditVerdict: "pass",
			imageAuditVerdict: "pass",
			publishedAt: "2026-01-01T00:00:00Z",
		},
	};
}

describe("Marketplace handlers", () => {
	let db: Kysely<DbSchema>;
	let sqliteDb: BetterSqlite3.Database;
	let storage: Storage;
	let sandboxRunner: ReturnType<typeof createMockSandboxRunner>;
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		sqliteDb = new BetterSqlite3(":memory:");
		db = new Kysely<DbSchema>({
			dialect: new SqliteDialect({ database: sqliteDb }),
		});
		await runMigrations(db);

		storage = createMockStorage();
		sandboxRunner = createMockSandboxRunner();
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});

	afterEach(async () => {
		await db.destroy();
		sqliteDb.close();
		vi.restoreAllMocks();
	});

	// ── Install ────────────────────────────────────────────────────

	describe("handleMarketplaceInstall", () => {
		it("returns error when marketplace not configured", async () => {
			const result = await handleMarketplaceInstall(db, storage, sandboxRunner, undefined, "test");
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("MARKETPLACE_NOT_CONFIGURED");
		});

		it("returns error when storage not available", async () => {
			const result = await handleMarketplaceInstall(
				db,
				null,
				sandboxRunner,
				MARKETPLACE_URL,
				"test",
			);
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("STORAGE_NOT_CONFIGURED");
		});

		it("returns error when sandbox runner not available", async () => {
			const result = await handleMarketplaceInstall(db, storage, null, MARKETPLACE_URL, "test");
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("SANDBOX_NOT_AVAILABLE");
		});

		it("successfully installs a marketplace plugin", async () => {
			const manifest = mockManifest("test-seo", "1.0.0");
			const bundleBytes = await createMockBundle(manifest);

			// Mock: getPlugin detail — set checksum to undefined so the check is skipped
			const detail = mockPluginDetail("test-seo", "1.0.0");
			detail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
			// Mock: downloadBundle
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));
			// Mock: reportInstall
			fetchSpy.mockResolvedValueOnce(new Response("OK", { status: 200 }));

			const result = await handleMarketplaceInstall(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
			);

			expect(result.success).toBe(true);
			expect(result.data?.pluginId).toBe("test-seo");
			expect(result.data?.version).toBe("1.0.0");
			expect(result.data?.capabilities).toEqual(["read:content"]);

			// Verify state was written
			const repo = new PluginStateRepository(db);
			const state = await repo.get("test-seo");
			expect(state?.source).toBe("marketplace");
			expect(state?.marketplaceVersion).toBe("1.0.0");
			expect(state?.status).toBe("active");
		});

		it("rejects install if plugin already installed", async () => {
			// Pre-install the plugin
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// Mock: getPlugin detail (still needed — called before install check... actually, the existing check comes first)
			const result = await handleMarketplaceInstall(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("ALREADY_INSTALLED");
		});

		it("rejects when manifest ID doesn't match requested plugin", async () => {
			const manifest = mockManifest("wrong-id", "1.0.0");
			const bundleBytes = await createMockBundle(manifest);

			// Clear checksum so we reach the manifest check
			const detail = mockPluginDetail("test-seo", "1.0.0");
			detail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));

			const result = await handleMarketplaceInstall(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("MANIFEST_MISMATCH");
		});

		it("validates checksum against requested pinned version metadata", async () => {
			const manifest = mockManifest("test-seo", "1.0.0");
			const bundleBytes = await createMockBundle(manifest);

			const detail = mockPluginDetail("test-seo", "2.0.0");
			detail.latestVersion!.checksum = "different-checksum";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
			fetchSpy.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [
							{
								version: "1.0.0",
								minEmDashVersion: null,
								bundleSize: 1234,
								checksum: "",
								changelog: null,
								capabilities: ["hooks"],
								auditVerdict: "pass",
								imageAuditVerdict: "pass",
								publishedAt: "2026-01-01T00:00:00Z",
							},
						],
					}),
					{ status: 200 },
				),
			);
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));
			fetchSpy.mockResolvedValueOnce(new Response("OK", { status: 200 }));

			const result = await handleMarketplaceInstall(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ version: "1.0.0" },
			);

			expect(result.success).toBe(true);
		});
	});

	// ── Install flow (pricing + confirm) ──────────────────────────

	describe("handleMarketplaceInstall pricing/confirm", () => {
		it("returns install token from pricing step", async () => {
			const detail = mockPluginDetail("test-seo", "1.0.0");
			detail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));

			const result = await handleMarketplacePricing(db, MARKETPLACE_URL, "test-seo", {});

			expect(result.success).toBe(true);
			expect(result.data?.pluginId).toBe("test-seo");
			expect(result.data?.version).toBe("1.0.0");
			expect(result.data?.capabilities).toEqual(["hooks"]);
			expect(typeof result.data?.installToken).toBe("string");
			expect(result.data?.installToken?.startsWith("ec_mp_")).toBe(true);
		});

		it("installs plugin after confirming with a valid token", async () => {
			const detail = mockPluginDetail("test-seo", "1.0.0");
			detail.latestVersion!.checksum = "";

			const manifest = mockManifest("test-seo", "1.0.0");
			const bundleBytes = await createMockBundle(manifest);
			fetchSpy.mockImplementation(async (input: string | URL | Request) => {
				const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
				if (requestUrl.includes("/versions/1.0.0/bundle")) {
					return new Response(bundleBytes, { status: 200 });
				}
				if (requestUrl.includes("/versions")) {
					return new Response(
						JSON.stringify({
							items: [
								{
									...(detail.latestVersion as {
										version: string;
										minEmDashVersion: string | null;
										bundleSize: number;
										checksum: string;
										changelog: string | null;
										capabilities: string[];
										status: string;
										auditVerdict: string | null;
										imageAuditVerdict: string | null;
										publishedAt: string;
									}),
								},
							],
						}),
						{ status: 200 },
					);
				}
				if (requestUrl.endsWith(`/api/v1/plugins/test-seo/installs`)) {
					return new Response("OK", { status: 200 });
				}
				return new Response(JSON.stringify(detail), { status: 200 });
			});

			const pricing = await handleMarketplacePricing(db, MARKETPLACE_URL, "test-seo", {});
			if (!pricing.success) {
				throw new Error("expected pricing to succeed");
			}

			const result = await handleMarketplaceInstallConfirm(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ installToken: pricing.data.installToken },
			);

			expect(result.success).toBe(true);
			expect(result.data?.pluginId).toBe("test-seo");
			expect(result.data?.version).toBe("1.0.0");

			const repo = new PluginStateRepository(db);
			const state = await repo.get("test-seo");
			expect(state?.source).toBe("marketplace");
			expect(state?.marketplaceVersion).toBe("1.0.0");
			expect(state?.status).toBe("active");
		});

		it("rejects confirm with invalid or expired token", async () => {
			const result = await handleMarketplaceInstallConfirm(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ installToken: "ec_mp_invalid_token" },
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("INVALID_TOKEN");
		});

		it("invalidates install token after successful confirm", async () => {
			const detail = mockPluginDetail("test-seo", "1.0.0");
			detail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));

			const pricing = await handleMarketplacePricing(db, MARKETPLACE_URL, "test-seo", {});
			if (!pricing.success) {
				throw new Error("expected pricing to succeed");
			}

			const manifest = mockManifest("test-seo", "1.0.0");
			const bundleBytes = await createMockBundle(manifest);
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));
			fetchSpy.mockResolvedValueOnce(new Response("OK", { status: 200 }));

			const firstConfirm = await handleMarketplaceInstallConfirm(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ installToken: pricing.data.installToken },
			);
			expect(firstConfirm.success).toBe(true);

			const replayConfirm = await handleMarketplaceInstallConfirm(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ installToken: pricing.data.installToken },
			);

			expect(replayConfirm.success).toBe(false);
			expect(replayConfirm.error?.code).toBe("INVALID_TOKEN");
		});

		it("rejects confirm when downloaded bundle manifest does not match plugin", async () => {
			const pricingDetail = mockPluginDetail("test-seo", "1.0.0");
			pricingDetail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(pricingDetail), { status: 200 }));

			const pricing = await handleMarketplacePricing(db, MARKETPLACE_URL, "test-seo", {});
			if (!pricing.success) {
				throw new Error("expected pricing to succeed");
			}

			const mismatchManifest = mockManifest("wrong-id", "1.0.0");
			const bundleBytes = await createMockBundle(mismatchManifest);
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(pricingDetail), { status: 200 }));
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));

			const result = await handleMarketplaceInstallConfirm(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ installToken: pricing.data.installToken },
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("MANIFEST_MISMATCH");

			const repo = new PluginStateRepository(db);
			const state = await repo.get("test-seo");
			expect(state).toBeNull();
		});
	});

	// ── Update ─────────────────────────────────────────────────────

	describe("handleMarketplaceUpdate", () => {
		it("returns error when plugin not found", async () => {
			const result = await handleMarketplaceUpdate(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"nonexistent",
			);
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("NOT_FOUND");
		});

		it("returns error when plugin is not from marketplace", async () => {
			// Insert a config-sourced plugin
			const repo = new PluginStateRepository(db);
			await repo.upsert("config-plugin", "1.0.0", "active");

			const result = await handleMarketplaceUpdate(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"config-plugin",
			);
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("NOT_FOUND");
		});

		it("returns error when already up to date", async () => {
			// Install v1.0.0
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// Mock getPlugin returning same version
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify(mockPluginDetail("test-seo", "1.0.0")), { status: 200 }),
			);

			const result = await handleMarketplaceUpdate(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
			);
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("ALREADY_UP_TO_DATE");
		});

		it("rejects update on checksum mismatch", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			const detail = mockPluginDetail("test-seo", "2.0.0");
			detail.latestVersion!.checksum = "expected-checksum";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));

			const bundleBytes = await createMockBundle(mockManifest("test-seo", "2.0.0"));
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));

			const result = await handleMarketplaceUpdate(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ confirmCapabilityChanges: true },
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CHECKSUM_MISMATCH");
		});

		it("rejects update when bundle manifest version mismatches target", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			const detail = mockPluginDetail("test-seo", "2.0.0");
			detail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));

			const wrongVersionManifest = mockManifest("test-seo", "9.9.9");
			const bundleBytes = await createMockBundle(wrongVersionManifest);
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));

			const result = await handleMarketplaceUpdate(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ confirmCapabilityChanges: true },
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("MANIFEST_VERSION_MISMATCH");
		});

		it("requires confirmation for capability escalation", async () => {
			// Install v1.0.0 with only "hooks" capability
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// Store old bundle in R2 (needed for capability diff)
			const oldManifest = mockManifest("test-seo", "1.0.0");
			const encoder = new TextEncoder();
			await storage.upload({
				key: "marketplace/test-seo/1.0.0/manifest.json",
				body: encoder.encode(JSON.stringify(oldManifest)),
				contentType: "application/json",
			});
			await storage.upload({
				key: "marketplace/test-seo/1.0.0/backend.js",
				body: encoder.encode("export default {};"),
				contentType: "application/javascript",
			});

			// New version has additional capability
			const newManifest = {
				...mockManifest("test-seo", "2.0.0"),
				capabilities: ["read:content", "network:fetch"],
			};
			const bundleBytes = await createMockBundle(newManifest as PluginManifest);

			// Mock getPlugin
			const detail = mockPluginDetail("test-seo", "2.0.0");
			detail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
			// Mock downloadBundle
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));

			const result = await handleMarketplaceUpdate(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
			);

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("CAPABILITY_ESCALATION");
			expect(result.error?.details?.capabilityChanges).toBeDefined();
		});

		it("succeeds with confirmCapabilityChanges flag", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// Store old bundle
			const encoder = new TextEncoder();
			const oldManifest = mockManifest("test-seo", "1.0.0");
			await storage.upload({
				key: "marketplace/test-seo/1.0.0/manifest.json",
				body: encoder.encode(JSON.stringify(oldManifest)),
				contentType: "application/json",
			});
			await storage.upload({
				key: "marketplace/test-seo/1.0.0/backend.js",
				body: encoder.encode("export default {};"),
				contentType: "application/javascript",
			});

			const newManifest = {
				...mockManifest("test-seo", "2.0.0"),
				capabilities: ["read:content", "network:fetch"],
			};
			const bundleBytes = await createMockBundle(newManifest as PluginManifest);

			const detail = mockPluginDetail("test-seo", "2.0.0");
			detail.latestVersion!.checksum = "";
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 200 }));
			fetchSpy.mockResolvedValueOnce(new Response(bundleBytes, { status: 200 }));

			const result = await handleMarketplaceUpdate(
				db,
				storage,
				sandboxRunner,
				MARKETPLACE_URL,
				"test-seo",
				{ confirmCapabilityChanges: true },
			);

			expect(result.success).toBe(true);
			expect(result.data?.oldVersion).toBe("1.0.0");
			expect(result.data?.newVersion).toBe("2.0.0");
			expect(result.data?.capabilityChanges.added).toContain("network:fetch");
		});
	});

	// ── Uninstall ──────────────────────────────────────────────────

	describe("handleMarketplaceUninstall", () => {
		it("returns error when plugin not found", async () => {
			const result = await handleMarketplaceUninstall(db, storage, "nonexistent");
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("NOT_FOUND");
		});

		it("returns error when plugin is not from marketplace", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("config-plugin", "1.0.0", "active");

			const result = await handleMarketplaceUninstall(db, storage, "config-plugin");
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("NOT_FOUND");
		});

		it("successfully uninstalls a marketplace plugin", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// Store bundle files that should be cleaned up
			const encoder = new TextEncoder();
			await storage.upload({
				key: "marketplace/test-seo/1.0.0/manifest.json",
				body: encoder.encode("{}"),
				contentType: "application/json",
			});
			await storage.upload({
				key: "marketplace/test-seo/1.0.0/backend.js",
				body: encoder.encode(""),
				contentType: "application/javascript",
			});

			const result = await handleMarketplaceUninstall(db, storage, "test-seo");

			expect(result.success).toBe(true);
			expect(result.data?.pluginId).toBe("test-seo");
			expect(result.data?.dataDeleted).toBe(false);

			// Verify state was deleted
			const state = await repo.get("test-seo");
			expect(state).toBeNull();
		});

		it("deletes plugin storage data when deleteData=true", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// Insert some plugin storage data
			await db
				.insertInto("_plugin_storage")
				.values({
					plugin_id: "test-seo",
					collection: "default",
					id: "test-key",
					data: JSON.stringify({ foo: "bar" }),
				})
				.execute();

			const result = await handleMarketplaceUninstall(db, storage, "test-seo", {
				deleteData: true,
			});

			expect(result.success).toBe(true);
			expect(result.data?.dataDeleted).toBe(true);

			// Verify plugin storage data was deleted
			const storageRows = await db
				.selectFrom("_plugin_storage")
				.selectAll()
				.where("plugin_id", "=", "test-seo")
				.execute();
			expect(storageRows).toHaveLength(0);
		});
	});

	// ── Update check ───────────────────────────────────────────────

	describe("handleMarketplaceUpdateCheck", () => {
		it("returns error when marketplace not configured", async () => {
			const result = await handleMarketplaceUpdateCheck(db, undefined);
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("MARKETPLACE_NOT_CONFIGURED");
		});

		it("returns empty items when no marketplace plugins installed", async () => {
			const result = await handleMarketplaceUpdateCheck(db, MARKETPLACE_URL);
			expect(result.success).toBe(true);
			expect(result.data?.items).toEqual([]);
		});

		it("detects available updates", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// Mock getPlugin returning newer version
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify(mockPluginDetail("test-seo", "2.0.0")), { status: 200 }),
			);

			const result = await handleMarketplaceUpdateCheck(db, MARKETPLACE_URL);

			expect(result.success).toBe(true);
			expect(result.data?.items).toHaveLength(1);
			expect(result.data?.items[0]?.hasUpdate).toBe(true);
			expect(result.data?.items[0]?.installed).toBe("1.0.0");
			expect(result.data?.items[0]?.latest).toBe("2.0.0");
		});

		it("reports no update when versions match", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify(mockPluginDetail("test-seo", "1.0.0")), { status: 200 }),
			);

			const result = await handleMarketplaceUpdateCheck(db, MARKETPLACE_URL);

			expect(result.success).toBe(true);
			expect(result.data?.items[0]?.hasUpdate).toBe(false);
		});

		it("skips plugins that fail to check", async () => {
			const repo = new PluginStateRepository(db);
			await repo.upsert("test-seo", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});
			await repo.upsert("test-analytics", "1.0.0", "active", {
				source: "marketplace",
				marketplaceVersion: "1.0.0",
			});

			// First plugin check fails (404 — delisted)
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
			);
			// Second plugin check succeeds
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify(mockPluginDetail("test-analytics", "2.0.0")), { status: 200 }),
			);

			const result = await handleMarketplaceUpdateCheck(db, MARKETPLACE_URL);

			expect(result.success).toBe(true);
			// Only the successful check should appear
			expect(result.data?.items).toHaveLength(1);
			expect(result.data?.items[0]?.pluginId).toBe("test-analytics");
		});
	});

	// ── Search proxy ───────────────────────────────────────────────

	describe("handleMarketplaceSearch", () => {
		it("returns error when marketplace not configured", async () => {
			const result = await handleMarketplaceSearch(undefined);
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("MARKETPLACE_NOT_CONFIGURED");
		});

		it("proxies search request to marketplace", async () => {
			fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

			const result = await handleMarketplaceSearch(MARKETPLACE_URL, "seo");

			expect(result.success).toBe(true);
			const [url] = fetchSpy.mock.calls[0]!;
			expect(url).toContain("/api/v1/plugins?q=seo");
		});
	});

	// ── GetPlugin proxy ────────────────────────────────────────────

	describe("handleMarketplaceGetPlugin", () => {
		it("returns error when marketplace not configured", async () => {
			const result = await handleMarketplaceGetPlugin(undefined, "test-seo");
			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("MARKETPLACE_NOT_CONFIGURED");
		});

		it("returns NOT_FOUND for missing plugin", async () => {
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
			);

			const result = await handleMarketplaceGetPlugin(MARKETPLACE_URL, "nonexistent");

			expect(result.success).toBe(false);
			expect(result.error?.code).toBe("NOT_FOUND");
		});

		it("proxies plugin detail from marketplace", async () => {
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify(mockPluginDetail()), { status: 200 }),
			);

			const result = await handleMarketplaceGetPlugin(MARKETPLACE_URL, "test-seo");

			expect(result.success).toBe(true);
		});
	});
});
