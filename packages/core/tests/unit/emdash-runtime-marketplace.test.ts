import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runMigrations } from "../../src/database/migrations/runner.js";
import { EmDashRuntime } from "../../src/emdash-runtime.js";
import type { Database as DbSchema } from "../../src/database/types.js";
import { PluginStateRepository } from "../../src/plugins/state.js";
import type { PluginManifest } from "../../src/plugins/types.js";
import type { Storage, UploadResult, DownloadResult, ListResult, SignedUploadUrl } from "../../src/storage/types.js";
import type { SandboxedPlugin } from "../../src/plugins/sandbox/types.js";

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
				const response = new Response(opts.body);
				body = new Uint8Array(await response.arrayBuffer());
			}
			store.set(opts.key, { body, contentType: opts.contentType });
			return {
				key: opts.key,
				url: `https://storage.test/${opts.key}`,
				size: body.length,
			};
		},
		async download(key: string): Promise<DownloadResult> {
			const item = store.get(key);
			if (!item) {
				throw new Error(`Not found: ${key}`);
			}
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

function createMockManifest(id: string, version: string): PluginManifest {
	return {
		id,
		version,
		capabilities: ["read:content"],
		allowedHosts: [],
		storage: {},
		hooks: [],
		routes: [{ name: "status", public: false }],
		admin: {},
	} as PluginManifest;
}

function createMockRuntimeLoader() {
	return {
		isAvailable(): boolean {
			return true;
		},
		async load(manifest: PluginManifest, code: string): Promise<SandboxedPlugin> {
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

function createRuntimeLoaderHarness() {
	return EmDashRuntime as unknown as {
		loadMarketplacePlugins: (
			db: Kysely<DbSchema>,
			storage: Storage,
			deps: { createSandboxRunner: (opts: { db: Kysely<DbSchema> }) => unknown },
			cache: Map<string, SandboxedPlugin>,
			pluginStates: Map<string, string>,
		) => Promise<void>;
	};
}

describe("EmDashRuntime marketplace plugin activation validation", () => {
	let db: Kysely<DbSchema>;
	let sqliteDb: BetterSqlite3.Database;
	let storage: Storage;
	let runtime: ReturnType<typeof createRuntimeLoaderHarness>;
	let repo: PluginStateRepository;

	beforeEach(async () => {
		sqliteDb = new BetterSqlite3(":memory:");
		db = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: sqliteDb }) });
		await runMigrations(db);
		storage = createMockStorage();
		repo = new PluginStateRepository(db);
		runtime = createRuntimeLoaderHarness();
	});

	afterEach(async () => {
		await db.destroy();
		sqliteDb.close();
	});

	async function writeBundle(pluginId: string, version: string, manifest: unknown): Promise<void> {
		const encoder = new TextEncoder();
		await storage.upload({
			key: `marketplace/${pluginId}/${version}/manifest.json`,
			body: encoder.encode(JSON.stringify(manifest)),
			contentType: "application/json",
		});
		await storage.upload({
			key: `marketplace/${pluginId}/${version}/backend.js`,
			body: encoder.encode("export default {}"),
			contentType: "application/javascript",
		});
	}

	it("deactivates marketplace plugin when bundle file is missing", async () => {
		await repo.upsert("missing-bundle", "1.0.0", "active", {
			source: "marketplace",
			marketplaceVersion: "1.0.0",
		});

		const pluginStates = new Map([["missing-bundle", "active"]]);
		const cache = new Map<string, SandboxedPlugin>();

		await runtime.loadMarketplacePlugins(db, storage, { createSandboxRunner: () => createMockRuntimeLoader() }, cache, pluginStates);

		const state = await repo.get("missing-bundle");
		expect(state?.status).toBe("inactive");
		expect(pluginStates.get("missing-bundle")).toBe("inactive");
	});

	it("deactivates marketplace plugin when manifest fails schema validation", async () => {
		await writeBundle("bad-manifest", "1.0.0", {
			id: "bad-manifest",
			version: "1.0.0",
			// intentionally missing required fields to fail plugin manifest validation
		});
		await repo.upsert("bad-manifest", "1.0.0", "active", {
			source: "marketplace",
			marketplaceVersion: "1.0.0",
		});

		const pluginStates = new Map([["bad-manifest", "active"]]);
		const cache = new Map<string, SandboxedPlugin>();

		await runtime.loadMarketplacePlugins(db, storage, { createSandboxRunner: () => createMockRuntimeLoader() }, cache, pluginStates);

		const state = await repo.get("bad-manifest");
		expect(state?.status).toBe("inactive");
		expect(pluginStates.get("bad-manifest")).toBe("inactive");
	});

	it("deactivates marketplace plugin when manifest id does not match configured plugin id", async () => {
		await writeBundle("wrong-id", "1.0.0", createMockManifest("not-a-match", "1.0.0"));
		await repo.upsert("wrong-id", "1.0.0", "active", {
			source: "marketplace",
			marketplaceVersion: "1.0.0",
		});

		const pluginStates = new Map([["wrong-id", "active"]]);
		const cache = new Map<string, SandboxedPlugin>();

		await runtime.loadMarketplacePlugins(db, storage, { createSandboxRunner: () => createMockRuntimeLoader() }, cache, pluginStates);

		const state = await repo.get("wrong-id");
		expect(state?.status).toBe("inactive");
		expect(pluginStates.get("wrong-id")).toBe("inactive");
	});

	it("deactivates marketplace plugin when manifest version does not match expected version", async () => {
		await writeBundle("wrong-version", "1.0.0", createMockManifest("wrong-version", "1.0.0"));
		await repo.upsert("wrong-version", "2.0.0", "active", {
			source: "marketplace",
			marketplaceVersion: "2.0.0",
		});

		const pluginStates = new Map([["wrong-version", "active"]]);
		const cache = new Map<string, SandboxedPlugin>();

		await runtime.loadMarketplacePlugins(db, storage, { createSandboxRunner: () => createMockRuntimeLoader() }, cache, pluginStates);

		const state = await repo.get("wrong-version");
		expect(state?.status).toBe("inactive");
		expect(pluginStates.get("wrong-version")).toBe("inactive");
	});
});
