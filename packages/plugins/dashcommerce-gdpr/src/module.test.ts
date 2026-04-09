import { describe, expect, it } from "vitest";
import { createCoreProvider, registerModule, type CommerceHost, type RouteInput } from "./module.js";
import type { GdprStorageCollection } from "./workflow/gdpr-persistence.js";

const HASH_64_RE = /^[a-f0-9]{64}$/;

class FakeStorageCollection<T extends { id: string } & Record<string, unknown>> implements GdprStorageCollection<T> {
	private rows = new Map<string, T>();
	private index: Array<{ id: string; data: T }> = [];

	public async get(id: string): Promise<T | null> {
		return this.rows.get(id) ?? null;
	}

	public async put(id: string, data: T): Promise<void> {
		const existing = this.rows.get(id);
		this.rows.set(id, data);
		if (!existing) {
			this.index.push({ id, data });
		} else {
			const idx = this.index.findIndex((entry) => entry.id === id);
			if (idx >= 0) this.index[idx] = { id, data };
		}
	}

	public async delete(id: string): Promise<boolean> {
		const deleted = this.rows.delete(id);
		this.index = this.index.filter((entry) => entry.id !== id);
		return deleted;
	}

	public async query(options?: { where?: Record<string, string> }): Promise<{ items: Array<{ id: string; data: T }> }> {
		let rows = [...this.index];
		if (options?.where) {
			for (const [key, value] of Object.entries(options.where)) {
				rows = rows.filter((row) => {
					const candidate = row.data as Record<string, unknown>;
					return String(candidate[key]) === value;
				});
			}
		}
		return { items: rows.map((row) => ({ ...row })) };
	}
}

describe("registerModule bootstrap surface", () => {
	it("registers routes, migrations, and provider when active", async () => {
		const adminRoutes: RouteInput[] = [];
		const customerRoutes: RouteInput[] = [];
		const providerIds: string[] = [];
		const storageCollections: string[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const registeredMigrations: Array<{ moduleId: string; migrations: string[] }> = [];
		const jobs: string[] = [];
		const hooks: string[] = [];

		const host: CommerceHost = {
			logger: {
				info: (..._args) => undefined,
				warn: (..._args) => undefined,
				error: (..._args) => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: (_key, _schema) => {
					if (!_schema || typeof _schema !== "object" || !("default" in _schema)) return;
					const schema = _schema as { default?: unknown };
					if (!configValues.has(_key) && schema.default !== undefined) {
						configValues.set(_key, schema.default);
					}
				},
			},
			routes: {
				registerAdminRoute: (route) => {
					adminRoutes.push(route);
				},
				registerRoute: (route) => {
					customerRoutes.push(route);
				},
			},
			hooks: {
				on: (event, _handler) => {
					hooks.push(event);
				},
			},
			admin: {
				registerSettingsTab: (_tab) => undefined,
				registerOrderPanel: (_panel) => undefined,
			},
			migrations: {
				register: (moduleId, migrations) => {
					registeredMigrations.push({ moduleId, migrations });
				},
			},
			jobs: {
				register: (id, _handler) => {
					jobs.push(id);
				},
			},
			storage: {
				registerCollection: (name) => {
					storageCollections.push(name);
					return Promise.resolve();
				},
			},
			gdpr: {
				registerProvider: (provider) => {
					providerIds.push(provider.id);
				},
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();
		await moduleDef.init();
		await moduleDef.ready?.();

		expect(registeredMigrations.map((entry) => entry.moduleId)).toContain("dashcommerce.gdpr");
		expect(adminRoutes).toHaveLength(7);
		expect(customerRoutes).toHaveLength(7);
		expect(storageCollections).toContain("dc_gdpr_subject_index");
		expect(storageCollections).toContain("dc_gdpr_requests");
		expect(jobs).toContain("gdpr:process-request");
		expect(hooks).toContain("order.created");
		expect(hooks).toContain("order.paid");
		expect(providerIds).toContain("dashcommerce-core");

		const handler = customerRoutes.find(
			(route) => route.path === "/account/privacy/export" && route.method === "POST",
		);
		if (!handler) throw new Error("route missing");
		const response = (await handler.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-1",
					subjectKind: "customer",
					right: "portability",
					requestedBy: "admin",
					idempotencyKey: "route-key",
				}),
			},
		}) as { ok?: boolean; requestId?: string; right?: "portability" | "erasure" | "rectification" | "restriction" | "objection" });

		expect(response.ok).toBe(true);
		expect(response.requestId).toBeDefined();
		expect(response.right).toBe("portability");
		expect(hooks).toContain("order.paid");

		const eraseHandler = customerRoutes.find(
			(route) => route.path === "/account/privacy/erase" && route.method === "POST",
		);
		const rectifyHandler = customerRoutes.find(
			(route) => route.path === "/account/privacy/rectify" && route.method === "POST",
		);
		if (!eraseHandler || !rectifyHandler) throw new Error("action route missing");
		const eraseResponse = (await eraseHandler.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-2",
					subjectKind: "customer",
					requestedBy: "admin",
				}),
			},
		}) as { ok?: boolean; requestId?: string; right?: string });
		const rectifyResponse = (await rectifyHandler.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-3",
					subjectKind: "customer",
					requestedBy: "admin",
				}),
			},
		}) as { ok?: boolean; requestId?: string; right?: string });
		expect(eraseResponse.ok).toBe(true);
		expect(eraseResponse.right).toBe("erasure");
		expect(eraseResponse.requestId).toBeDefined();
		expect(rectifyResponse.ok).toBe(true);
		expect(rectifyResponse.right).toBe("rectification");
		expect(rectifyResponse.requestId).toBeDefined();
	});

	it("manages legal holds through admin routes", async () => {
		const adminRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: (route) => adminRoutes.push(route),
				registerRoute: () => undefined,
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();

		const create = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/legal-holds" && route.method === "POST",
		);
		const list = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/legal-holds" && route.method === "GET",
		);
		const revoke = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/legal-holds" && route.method === "DELETE",
		);
		if (!create || !list || !revoke) throw new Error("legal hold routes missing");

		const createResponse = (await create.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-4",
					subjectKind: "customer",
					reasonCode: "fraud",
					reasonDetails: "active dispute",
				}),
			},
			query: undefined,
		}) as { ok?: boolean; holds?: Array<{ reasonCode: string }> });
		expect(createResponse.ok).toBe(true);
		expect(createResponse.holds?.[0]?.reasonCode).toBe("fraud");

		const listResponse = (await list.handler({
			request: {
				method: "GET",
				json: undefined,
			},
			query: {
				subjectId: "cust-4",
				subjectKind: "customer",
			},
		}) as { ok?: boolean; holds?: Array<{ reasonCode: string }> });
		expect(listResponse.ok).toBe(true);
		expect(listResponse.holds).toHaveLength(1);
		expect(listResponse.holds?.[0]?.reasonCode).toBe("fraud");

		const revokeResponse = (await revoke.handler({
			request: {
				method: "DELETE",
				json: undefined,
			},
			query: {
				subjectId: "cust-4",
				subjectKind: "customer",
			},
		}) as { ok?: boolean });
		expect(revokeResponse.ok).toBe(true);

		const listAfter = (await list.handler({
			request: {
				method: "GET",
				json: undefined,
			},
			query: {
				subjectId: "cust-4",
				subjectKind: "customer",
			},
		}) as { ok?: boolean; holds?: Array<unknown> });
		expect(listAfter.ok).toBe(true);
		expect(listAfter.holds).toHaveLength(0);
	});

	it("rejects legal-hold payload with invalid expiry format", async () => {
		const adminRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: (route) => adminRoutes.push(route),
				registerRoute: () => undefined,
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();

		const create = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/legal-holds" && route.method === "POST",
		);
		if (!create) throw new Error("route missing");

		const response = (await create.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-6",
					subjectKind: "customer",
					reasonCode: "fraud",
					reasonDetails: "bad expiry",
					expiresAt: "not-a-date",
				}),
			},
		}) as { ok?: boolean; errorCode?: string });

		expect(response.ok).toBe(false);
		expect(response.errorCode).toBe("INVALID_LEGAL_HOLD_PAYLOAD");
	});

	it("supports consent read/write through customer-facing route", async () => {
		const customerRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: () => undefined,
				registerRoute: (route) => customerRoutes.push(route),
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();

		const update = customerRoutes.find(
			(route) => route.path === "/account/privacy/consent" && route.method === "POST",
		);
		if (!update) throw new Error("route missing");
		const updateResponse = (await update.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-3",
					subjectKind: "customer",
					purpose: "marketing",
					granted: true,
				}),
			},
		}) as { ok?: boolean; consent?: { subjectId: string; purpose: string } });

		expect(updateResponse.ok).toBe(true);
		expect(updateResponse.consent?.subjectId).toBe("cust-3");

		const get = customerRoutes.find(
			(route) => route.path === "/account/privacy/consent" && route.method === "GET",
		);
		if (!get) throw new Error("route missing");
		const getResponse = (await get.handler({
			request: {
				method: "GET",
				json: undefined,
			},
			query: {
				subjectId: "cust-3",
				subjectKind: "customer",
			},
		}) as { ok?: boolean; consents?: Array<{ purpose: string }> });

		expect(getResponse.ok).toBe(true);
		expect(getResponse.consents?.length).toBe(1);
		expect(getResponse.consents?.[0]?.purpose).toBe("marketing");

		const revoke = customerRoutes.find(
			(route) => route.path === "/account/privacy/consent" && route.method === "DELETE",
		);
		if (!revoke) throw new Error("route missing");
		const revokeResponse = (await revoke.handler({
			request: {
				method: "DELETE",
				json: async () => ({
					subjectId: "cust-3",
					subjectKind: "customer",
					purpose: "marketing",
					granted: false,
				}),
			},
		}) as { ok?: boolean; consents?: Array<{ purpose: string }> });

		expect(revokeResponse.ok).toBe(true);
		expect(revokeResponse.consents).toHaveLength(0);
	});

	it("persists consent through provided storage collections in module routes", async () => {
		const customerRoutes: RouteInput[] = [];
		const consentCollection = new FakeStorageCollection<{
			id: string;
			subjectId: string;
			subjectKind: "customer" | "guest";
			purpose: "marketing" | "analytics" | "personalization";
			granted: boolean;
			updatedAt: string;
		}>();
		const legalHoldCollection = new FakeStorageCollection<{
			id: string;
			subjectId: string;
			subjectKind: "customer" | "guest";
			reasonCode: string;
			reasonDetails: string;
			createdAt: string;
			expiresAt?: string;
		}>();
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: () => undefined,
				registerRoute: (route) => customerRoutes.push(route),
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
				collections: {
					dc_gdpr_consents: consentCollection,
					dc_gdpr_legal_holds: legalHoldCollection,
				},
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();
		await moduleDef.init();

		const set = customerRoutes.find((route) => route.path === "/account/privacy/consent" && route.method === "POST");
		if (!set) throw new Error("route missing");
		const updateResponse = (await set.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "repo-customer",
					subjectKind: "customer",
					purpose: "analytics",
					granted: true,
				}),
			},
		}) as { ok?: boolean });
		expect(updateResponse.ok).toBe(true);

		const get = customerRoutes.find((route) => route.path === "/account/privacy/consent" && route.method === "GET");
		if (!get) throw new Error("route missing");
		const getResponse = (await get.handler({
			request: {
				method: "GET",
				json: undefined,
			},
			query: {
				subjectId: "repo-customer",
				subjectKind: "customer",
			},
		}) as { ok?: boolean; consents?: Array<{ subjectId: string; subjectKind: string; purpose: string; granted: boolean }> });
		expect(getResponse.ok).toBe(true);
		expect(getResponse.consents).toHaveLength(1);
		expect(getResponse.consents?.[0]?.subjectId).toBe("repo-customer");
		expect(getResponse.consents?.[0]?.purpose).toBe("analytics");
		expect(getResponse.consents?.[0]?.granted).toBe(true);
	});

	it("persists request, operations, and audit records through provided storage collections in module routes", async () => {
		const adminRoutes: RouteInput[] = [];
		const customerRoutes: RouteInput[] = [];
		const requestCollection = new FakeStorageCollection<{
			id: string;
			requestId: string;
			subjectId: string;
			subjectKind: "customer" | "guest";
			right: "access" | "portability" | "erasure" | "rectification" | "restriction" | "objection";
			status: "received" | "queued" | "running" | "partially_completed" | "completed" | "failed" | "denied";
			requestedBy: string;
			requestHash: string;
			createdAt: string;
			updatedAt: string;
			idempotencyKey: string;
		}>();
		const operationCollection = new FakeStorageCollection<{
			id: string;
			requestId: string;
			providerId: string;
			action: "export" | "erase" | "anonymize" | "rectify";
			status: "queued" | "running" | "completed" | "partial" | "failed" | "blocked" | "skipped";
			attempt: number;
			dedupeKey: string;
		}>();
		const auditCollection = new FakeStorageCollection<{
			id: string;
			requestId?: string;
			operationId?: string;
			providerId?: string;
			actorId?: string;
			eventType: "request.created" | "request.completed" | "request.denied" | "operation.completed" | "operation.failed";
			message: string;
			createdAt: string;
		}>();
		const exportCollection = new FakeStorageCollection<{
			id: string;
			requestId: string;
			providerId: string;
			subjectId: string;
			subjectKind: "customer" | "guest";
			payloadLocation?: string;
			payloadVersion?: string;
			sha256?: string;
			sizeBytes?: number;
			createdAt: string;
		}>();
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: (route) => adminRoutes.push(route),
				registerRoute: (route) => customerRoutes.push(route),
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
				collections: {
					dc_gdpr_requests: requestCollection,
					dc_gdpr_operations: operationCollection,
					dc_gdpr_audit_log: auditCollection,
					dc_gdpr_exports: exportCollection,
				},
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();
		await moduleDef.init();

		const exportRequest = customerRoutes.find(
			(route) => route.path === "/account/privacy/export" && route.method === "POST",
		);
		if (!exportRequest) throw new Error("route missing");
		const createResponse = (await exportRequest.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "repo-request",
					subjectKind: "customer",
					right: "portability",
					requestedBy: "admin",
					idempotencyKey: "repo-request-key",
				}),
			},
		}) as { ok?: boolean; requestId?: string });
		expect(createResponse.ok).toBe(true);
		if (!createResponse.requestId) throw new Error("request id missing");

		const requestRows = await requestCollection.query({ where: { requestId: createResponse.requestId } });
		const operationRows = await operationCollection.query({ where: { requestId: createResponse.requestId } });
		const auditRows = await auditCollection.query({ where: { requestId: createResponse.requestId } });
		const exportRows = await exportCollection.query({ where: { requestId: createResponse.requestId } });
		expect(requestRows.items).toHaveLength(1);
		expect(operationRows.items).toHaveLength(1);
		expect(auditRows.items.length).toBeGreaterThanOrEqual(2);
		expect(exportRows.items).toHaveLength(1);
		expect(requestRows.items[0]?.data.subjectId).toBe("repo-request");
		expect(operationRows.items[0]?.data.providerId).toBe("dashcommerce-core");

		const getRequestRoute = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/requests/:id" && route.method === "GET",
		);
		if (!getRequestRoute) throw new Error("route missing");
		const getRequestResponse = (await getRequestRoute.handler({
			request: { method: "GET", json: undefined },
			params: { id: createResponse.requestId },
		}) as { ok?: boolean; request?: { requestId: string }; operations?: Array<{ providerId: string }> });
		expect(getRequestResponse.ok).toBe(true);
		expect(getRequestResponse.request?.requestId).toBe(createResponse.requestId);
		expect(getRequestResponse.operations?.length).toBe(1);

		const listRequestRoute = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/requests" && route.method === "GET",
		);
		if (!listRequestRoute) throw new Error("route missing");
		const listRequestResponse = (await listRequestRoute.handler({
			request: { method: "GET", json: undefined },
		}) as { ok?: boolean; total?: number; requests?: Array<{ requestId: string }> });
		expect(listRequestResponse.ok).toBe(true);
		expect(listRequestResponse.total).toBe(1);
		expect(listRequestResponse.requests?.length).toBe(1);

		const auditRoute = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/audit/:id" && route.method === "GET",
		);
		if (!auditRoute) throw new Error("route missing");
		const auditResponse = (await auditRoute.handler({
			request: { method: "GET", json: undefined },
			params: { id: createResponse.requestId },
		}) as { ok?: boolean; events?: Array<{ requestId?: string }> });
		expect(auditResponse.ok).toBe(true);
		expect(auditResponse.events?.length).toBeGreaterThanOrEqual(2);

		const duplicate = (await exportRequest.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "repo-request",
					subjectKind: "customer",
					right: "portability",
					requestedBy: "admin",
					idempotencyKey: "repo-request-key",
				}),
			},
		}) as { ok?: boolean; requestId?: string });
		expect(duplicate.ok).toBe(true);
		expect(duplicate.requestId).toBe(createResponse.requestId);

		const requestRowsAfter = await requestCollection.query({ where: { subjectId: "repo-request", subjectKind: "customer" } });
		expect(requestRowsAfter.items).toHaveLength(1);
	});

	it("checks consent state through a dedicated consent-check route", async () => {
		const customerRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: () => undefined,
				registerRoute: (route) => customerRoutes.push(route),
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();

		const set = customerRoutes.find(
			(route) => route.path === "/account/privacy/consent" && route.method === "POST",
		);
		if (!set) throw new Error("route missing");
		await set.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-check",
					subjectKind: "customer",
					purpose: "analytics",
					granted: true,
				}),
			},
		});

		const check = customerRoutes.find(
			(route) => route.path === "/account/privacy/consent/check" && route.method === "GET",
		);
		if (!check) throw new Error("route missing");
		const checkResponse = (await check.handler({
			request: {
				method: "GET",
				json: undefined,
			},
			query: {
				subjectId: "cust-check",
				subjectKind: "customer",
				purpose: "analytics",
			},
		}) as { ok?: boolean; hasConsent?: boolean });
		const missingResponse = (await check.handler({
			request: {
				method: "GET",
				json: undefined,
			},
			query: {
				subjectId: "cust-check",
				subjectKind: "customer",
				purpose: "marketing",
			},
		}) as { ok?: boolean; hasConsent?: boolean });

		expect(checkResponse.ok).toBe(true);
		expect(checkResponse.hasConsent).toBe(true);
		expect(missingResponse.ok).toBe(true);
		expect(missingResponse.hasConsent).toBe(false);
	});

	it("returns a clear disabled response when module flag is off", async () => {
		const customerRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", false]]);
		const host: CommerceHost = {
			logger: {
				info: (..._args) => undefined,
				warn: (..._args) => undefined,
				error: (..._args) => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: (_key, _schema) => {
					if (!_schema || typeof _schema !== "object" || !("default" in _schema)) return;
					const schema = _schema as { default?: unknown };
					if (!configValues.has(_key) && schema.default !== undefined) {
						configValues.set(_key, schema.default);
					}
				},
			},
			routes: {
				registerAdminRoute: () => undefined,
				registerRoute: (route) => {
					customerRoutes.push(route);
				},
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();

		const handler = customerRoutes.find((route) => route.path === "/account/privacy/export");
		if (!handler) throw new Error("route missing");
		const response = (await handler.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-2",
					subjectKind: "customer",
					right: "portability",
					requestedBy: "admin",
				}),
			},
		}) as { enabled?: boolean; ok?: boolean });

		expect(response.enabled).toBe(false);
		expect(response.ok).toBe(false);
	});

	it("returns disabled response for legal-hold admin routes when module is off", async () => {
		const adminRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", false]]);
		const host: CommerceHost = {
			logger: {
				info: (..._args) => undefined,
				warn: (..._args) => undefined,
				error: (..._args) => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: (_key, _schema) => {
					if (!_schema || typeof _schema !== "object" || !("default" in _schema)) return;
					const schema = _schema as { default?: unknown };
					if (!configValues.has(_key) && schema.default !== undefined) {
						configValues.set(_key, schema.default);
					}
				},
			},
			routes: {
				registerAdminRoute: (route) => adminRoutes.push(route),
				registerRoute: () => undefined,
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();

		const legalHoldCreate = adminRoutes.find(
			(route) => route.path === "/admin/api/gdpr/legal-holds" && route.method === "POST",
		);
		if (!legalHoldCreate) throw new Error("route missing");

		const response = (await legalHoldCreate.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-5",
					subjectKind: "customer",
					reasonCode: "fraud",
					reasonDetails: "disabled",
				}),
			},
		}) as { enabled?: boolean; ok?: boolean });

		expect(response.enabled).toBe(false);
		expect(response.ok).toBe(false);
	});

	it("rejects invalid payload for consent check route", async () => {
		const customerRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: () => undefined,
				registerRoute: (route) => customerRoutes.push(route),
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
			gdpr: {
				registerProvider: () => undefined,
			},
		};
		const moduleDef = registerModule(host);
		await moduleDef.register();

		const check = customerRoutes.find(
			(route) => route.path === "/account/privacy/consent/check" && route.method === "GET",
		);
		if (!check) throw new Error("route missing");

		const response = (await check.handler({
			request: {
				method: "GET",
				json: async () => ({
					subjectId: "cust-check",
					subjectKind: "customer",
				}),
			},
		}) as { ok?: boolean; errorCode?: string });

		expect(response.ok).toBe(false);
		expect(response.errorCode).toBe("INVALID_CONSENT_CHECK_PAYLOAD");
	});
});

describe("core provider data export", () => {
	it("exports commerce snapshots from order/cart/payment attempt anchors", async () => {
		const orders = new FakeStorageCollection<{
			id: string;
			cartId: string;
			paymentPhase: string;
			currency: string;
			lineItems: Array<{ id: string }>;
			totalMinor: number;
			createdAt: string;
			updatedAt: string;
		}>();
		const carts = new FakeStorageCollection<{
			id: string;
			currency: string;
			lineItems: Array<{ id: string }>;
			createdAt: string;
			updatedAt: string;
		}>();
		const paymentAttempts = new FakeStorageCollection<{
			id: string;
			orderId: string;
			providerId: string;
			status: string;
			createdAt: string;
			updatedAt: string;
		}>();

		await orders.put("order-1", {
			id: "order-1",
			cartId: "cart-1",
			paymentPhase: "paid",
			currency: "USD",
			lineItems: [{ id: "li-1" }, { id: "li-2" }],
			totalMinor: 1200,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
		});
		await carts.put("cart-1", {
			id: "cart-1",
			currency: "USD",
			lineItems: [{ id: "li-1" }],
			createdAt: "2026-03-31T23:00:00.000Z",
			updatedAt: "2026-03-31T23:00:00.000Z",
		});
		await paymentAttempts.put("attempt-1", {
			id: "attempt-1",
			orderId: "order-1",
			providerId: "stripe",
			status: "succeeded",
			createdAt: "2026-04-01T00:01:00.000Z",
			updatedAt: "2026-04-01T00:01:00.000Z",
		});

		const provider = createCoreProvider({
			orders,
			carts,
			paymentAttempts,
		});
		const payload = await provider.exportData(
			{
				subjectId: "cust-1",
				subjectKind: "customer",
				anchor: {
					orderId: "order-1",
					cartId: "cart-1",
				},
			},
			{ dryRun: false },
		);

		expect(payload.records).toHaveLength(3);
		expect(payload.records[0]).toMatchObject({
			id: "order-1",
			fields: { source: "order", subjectId: "cust-1", subjectKind: "customer" },
		});
		expect(payload.metadata).toMatchObject({
			hasCollections: true,
		});
		expect(payload.records[1]).toMatchObject({
			id: "cart-1",
			fields: { source: "cart", subjectId: "cust-1", subjectKind: "customer" },
		});
		expect(payload.records[2]).toMatchObject({
			id: "attempt-1",
			fields: { source: "paymentAttempt", orderId: "order-1" },
		});
	});

	it("returns deterministic action outcomes for matching core anchors", async () => {
		const orders = new FakeStorageCollection<{
			id: string;
			cartId: string;
			paymentPhase: string;
			currency: string;
			lineItems: Array<{ id: string }>;
			totalMinor: number;
			createdAt: string;
			updatedAt: string;
		}>();
		const carts = new FakeStorageCollection<{
			id: string;
			currency: string;
			lineItems: Array<{ id: string }>;
			createdAt: string;
			updatedAt: string;
		}>();
		const paymentAttempts = new FakeStorageCollection<{
			id: string;
			orderId: string;
			providerId: string;
			status: string;
			createdAt: string;
			updatedAt: string;
		}>();

		await orders.put("order-core", {
			id: "order-core",
			cartId: "cart-core",
			paymentPhase: "authorized",
			currency: "USD",
			lineItems: [{ id: "li-1" }],
			totalMinor: 2500,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
		});
		await carts.put("cart-core", {
			id: "cart-core",
			currency: "USD",
			lineItems: [{ id: "li-1" }],
			createdAt: "2026-03-31T23:00:00.000Z",
			updatedAt: "2026-03-31T23:00:00.000Z",
		});
		await paymentAttempts.put("attempt-core", {
			id: "attempt-core",
			orderId: "order-core",
			providerId: "stripe",
			status: "succeeded",
			createdAt: "2026-04-01T00:01:00.000Z",
			updatedAt: "2026-04-01T00:01:00.000Z",
		});

		const provider = createCoreProvider({ orders, carts, paymentAttempts });
		const subject = {
			subjectId: "cust-core-actions",
			subjectKind: "customer" as const,
			anchor: { orderId: "order-core", cartId: "cart-core" },
		};

		const eraseResult = await provider.eraseData(subject, { dryRun: false, legalHoldOk: true });
		const anonymizeResult = await provider.anonymizeData(subject, { dryRun: false, legalHoldOk: true });
		if (!provider.rectifyData) throw new Error("rectifyData not implemented in provider");
		const rectifyResult = await provider.rectifyData(subject, { subjectAlias: "customer-1" });
		const rectifyEmptyResult = await provider.rectifyData(subject, {});

		expect(eraseResult.status).toBe("success");
		expect(eraseResult.processed).toBe(3);
		expect(eraseResult.requestIdempotencyKey).toMatch(HASH_64_RE);
		expect(anonymizeResult.status).toBe("success");
		expect(anonymizeResult.processed).toBe(3);
		expect(anonymizeResult.requestIdempotencyKey).toMatch(HASH_64_RE);
		expect(rectifyResult.status).toBe("success");
		expect(rectifyResult.processed).toBe(3);
		expect(rectifyEmptyResult.status).toBe("skipped");
		expect(rectifyEmptyResult.processed).toBe(0);
	});

	it("registers and executes gdpr:process-request replay job", async () => {
		const jobHandlers = new Map<string, (ctx: Record<string, unknown>) => Promise<unknown>>();
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);
		const customerRoutes: RouteInput[] = [];
		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: () => undefined,
				registerRoute: (route) => customerRoutes.push(route),
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: (id, handler) => {
					jobHandlers.set(id, handler);
				},
			},
			storage: {
				registerCollection: () => Promise.resolve(),
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();
		await moduleDef.init();
		const exportRoute = customerRoutes.find((route) => route.path === "/account/privacy/export");
		if (!exportRoute) throw new Error("route missing");
		const processRequest = jobHandlers.get("gdpr:process-request");
		if (!processRequest) throw new Error("job missing");
		const typedProcessRequest = processRequest as (ctx: Record<string, unknown>) => Promise<{ requestId?: string; status?: string } | undefined>;

		const requestResponse = (await exportRoute.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "cust-job",
					subjectKind: "customer",
					requestedBy: "job-user",
				}),
			},
		}) as { ok?: boolean; requestId?: string; status?: string });
		if (!requestResponse.requestId) throw new Error("request response missing requestId");
		const replayResult = await typedProcessRequest({ requestId: requestResponse.requestId });
		expect(replayResult).toBeDefined();
		expect(replayResult?.requestId).toBe(requestResponse.requestId);
		expect(replayResult?.status).toBe("completed");
		expect(requestResponse.requestId).toBeTruthy();
	});

	it("persists and returns route-level export with anchors when core collections are available", async () => {
		const orders = new FakeStorageCollection<{
			id: string;
			cartId: string;
			paymentPhase: string;
			currency: string;
			lineItems: Array<{ id: string }>;
			totalMinor: number;
			createdAt: string;
			updatedAt: string;
		}>();
		const carts = new FakeStorageCollection<{
			id: string;
			currency: string;
			lineItems: Array<{ id: string }>;
			createdAt: string;
			updatedAt: string;
		}>();
		const paymentAttempts = new FakeStorageCollection<{
			id: string;
			orderId: string;
			providerId: string;
			status: string;
			createdAt: string;
			updatedAt: string;
		}>();
		const requestCollection = new FakeStorageCollection<{
			id: string;
			requestId: string;
			subjectId: string;
			subjectKind: "customer" | "guest";
			right: "access" | "portability" | "erasure" | "rectification" | "restriction" | "objection";
			status: "received" | "queued" | "running" | "partially_completed" | "completed" | "failed" | "denied";
			requestedBy: string;
			requestHash: string;
			createdAt: string;
			updatedAt: string;
			idempotencyKey: string;
			scope?: string;
		}>();
		const operationCollection = new FakeStorageCollection<{
			id: string;
			requestId: string;
			providerId: string;
			action: "export" | "erase" | "anonymize" | "rectify";
			status: "queued" | "running" | "completed" | "partial" | "failed" | "blocked" | "skipped";
			attempt: number;
			dedupeKey: string;
			finishedAt?: string;
		}>();
		const exportCollection = new FakeStorageCollection<{
			id: string;
			requestId: string;
			providerId: string;
			subjectId: string;
			subjectKind: "customer" | "guest";
			payloadLocation?: string;
			payloadVersion?: string;
			sizeBytes?: number;
			createdAt: string;
		}>();
		const customerRoutes: RouteInput[] = [];
		const configValues = new Map<string, unknown>([["modules.gdpr.enabled", true]]);

		await orders.put("order-2", {
			id: "order-2",
			cartId: "cart-2",
			paymentPhase: "authorized",
			currency: "EUR",
			lineItems: [{ id: "line-1" }],
			totalMinor: 5000,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
		});
		await carts.put("cart-2", {
			id: "cart-2",
			currency: "EUR",
			lineItems: [{ id: "line-1" }],
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-01T00:00:00.000Z",
		});
		await paymentAttempts.put("attempt-2", {
			id: "attempt-2",
			orderId: "order-2",
			providerId: "stripe",
			status: "pending",
			createdAt: "2026-04-01T00:00:01.000Z",
			updatedAt: "2026-04-01T00:00:01.000Z",
		});

		const host: CommerceHost = {
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
			config: {
				get: (key, fallback) => configValues.get(key) ?? fallback,
				register: () => undefined,
			},
			routes: {
				registerAdminRoute: () => undefined,
				registerRoute: (route) => customerRoutes.push(route),
			},
			hooks: {
				on: () => undefined,
			},
			admin: {
				registerSettingsTab: () => undefined,
				registerOrderPanel: () => undefined,
			},
			migrations: {
				register: () => undefined,
			},
			jobs: {
				register: () => undefined,
			},
			storage: {
				registerCollection: () => Promise.resolve(),
				collections: {
					orders,
					carts,
					paymentAttempts,
					dc_gdpr_requests: requestCollection,
					dc_gdpr_operations: operationCollection,
					dc_gdpr_exports: exportCollection,
				},
			},
		};

		const moduleDef = registerModule(host);
		await moduleDef.register();
		await moduleDef.init();

		const exportRoute = customerRoutes.find((route) => route.path === "/account/privacy/export");
		if (!exportRoute) throw new Error("route missing");
		const response = (await exportRoute.handler({
			request: {
				method: "POST",
				json: async () => ({
					subjectId: "route-cust",
					subjectKind: "customer",
					requestedBy: "route-user",
					anchor: {
						orderId: "order-2",
						cartId: "cart-2",
					},
				}),
			},
		}) as { ok?: boolean; requestId?: string });
		if (!response.requestId) throw new Error("request id missing");
		expect(response.ok).toBe(true);

		const requestRows = await requestCollection.query({ where: { requestId: response.requestId } });
		const operationRows = await operationCollection.query({ where: { requestId: response.requestId } });
		const exportRows = await exportCollection.query({ where: { requestId: response.requestId } });
		expect(requestRows.items).toHaveLength(1);
		expect(operationRows.items).toHaveLength(1);
		expect(exportRows.items).toHaveLength(1);
		const requestScope = requestRows.items[0]?.data.scope;
		expect(requestScope).toBeDefined();
		expect(requestScope).toContain("orderId");
		const payloadLocation = exportRows.items[0]?.data.payloadLocation;
		expect(payloadLocation).toContain(response.requestId);
		expect(payloadLocation).toContain("dashcommerce-core");
		expect(exportRows.items[0]?.data.sizeBytes).toBeGreaterThan(0);
	});

	it("falls back to a synthetic record when no core data matches anchors", async () => {
		const provider = createCoreProvider({
			orders: new FakeStorageCollection<{
				id: string;
			}>(),
			carts: new FakeStorageCollection<{
				id: string;
			}>(),
			paymentAttempts: new FakeStorageCollection<{
				id: string;
				orderId: string;
			}>(),
		});
		const payload = await provider.exportData(
			{
				subjectId: "cust-fallback",
				subjectKind: "customer",
				anchor: {
					orderId: "missing-order",
					cartId: "missing-cart",
				},
			},
			{ dryRun: true },
		);
		expect(payload.records).toHaveLength(1);
		expect(payload.records[0]).toMatchObject({
			id: "cust-fallback",
			fields: {
				subjectId: "cust-fallback",
				subjectKind: "customer",
				reason: "No core records found for provided anchors",
			},
		});
	});
});
