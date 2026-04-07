import { describe, expect, it } from "vitest";
import type { GdprPersonalDataProvider, GdprPersonalData } from "../types.js";
import { GdprWorkflowEngine } from "./gdpr-workflow.js";
import {
	InMemoryConsentStore,
	InMemoryLegalHoldStore,
	InMemoryRequestStore,
	InMemoryOperationStore,
	InMemoryAuditStore,
	InMemoryExportStore,
	createConsentStore,
	createLegalHoldStore,
	createRequestStore,
	createOperationStore,
	createAuditStore,
	createExportStore,
	type GdprStorageCollection,
} from "./gdpr-persistence.js";

function createTestProvider() {
	let exportCalls = 0;
	const provider: GdprPersonalDataProvider = {
		id: "test-provider",
		name: "test-provider",
		capabilities: async () => ({
			canAccessExport: true,
			canErase: true,
			canAnonymize: true,
			canRectify: true,
		}),
		discoverSubjects: async () => [],
		exportData: async () => {
			exportCalls += 1;
			const payload: GdprPersonalData = {
				providerId: "test-provider",
				kind: "snapshot",
				records: [
					{
						id: "record-1",
						fields: { sample: "value" },
					},
				],
				metadata: { version: 1 },
			};
			return payload;
		},
		anonymizeData: async (_, { legalHoldOk }) => ({
			providerId: "test-provider",
			action: "anonymize",
			status: legalHoldOk ? "success" : "blocked",
			processed: legalHoldOk ? 1 : 0,
			requestIdempotencyKey: "anonymize",
			message: legalHoldOk ? "ok" : "blocked",
		}),
		eraseData: async () => {
			return {
				providerId: "test-provider",
				action: "erase",
				status: "success",
				processed: 1,
				requestIdempotencyKey: "erase",
			};
		},
		rectifyData: async () => ({
			providerId: "test-provider",
			action: "rectify",
			status: "skipped",
			processed: 0,
			requestIdempotencyKey: "rectify",
			message: "not supported",
		}),
	};
	return { provider, getExportCalls: () => exportCalls };
}

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

describe("GdprWorkflowEngine", () => {
	it("returns consistent idempotent output for the same request key", async () => {
		const engine = new GdprWorkflowEngine();
		const { provider, getExportCalls } = createTestProvider();
		engine.registerProvider(provider);

		const first = await engine.submitRequest({
			subjectId: "subject-1",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "user-1",
			idempotencyKey: "request-key",
		});

		const second = await engine.submitRequest({
			subjectId: "subject-1",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "user-1",
			idempotencyKey: "request-key",
		});

		expect(first.request.id).toBe(second.request.id);
		expect(first.request.requestId).toBe(second.request.requestId);
		expect(getExportCalls()).toBe(1);
	});

	it("treats different subject anchors as distinct idempotency keys", async () => {
		const engine = new GdprWorkflowEngine();
		const { provider } = createTestProvider();
		engine.registerProvider(provider);

		const first = await engine.submitRequest({
			subjectId: "anchor-subject",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "user-anchor",
			subjectAnchor: {
				orderId: "order-1",
			},
		});
		const second = await engine.submitRequest({
			subjectId: "anchor-subject",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "user-anchor",
			subjectAnchor: {
				orderId: "order-2",
			},
		});

		expect(second.request.requestId).not.toBe(first.request.requestId);
	});

	it("normalizes anchor key order for deterministic idempotency", async () => {
		const engine = new GdprWorkflowEngine();
		const { provider } = createTestProvider();
		engine.registerProvider(provider);

		const first = await engine.submitRequest({
			subjectId: "normalized-anchor-subject",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "user-anchor",
			subjectAnchor: {
				orderId: "order-n1",
				cartId: "cart-n1",
			},
		});
		const second = await engine.submitRequest({
			subjectId: "normalized-anchor-subject",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "user-anchor",
			subjectAnchor: {
				cartId: "cart-n1",
				orderId: "order-n1",
			} as { orderId: string; cartId: string },
		});

		expect(second.request.requestId).toBe(first.request.requestId);
	});

	it("blocks erase/anonymize actions when legal hold is active", async () => {
		const engine = new GdprWorkflowEngine();
		const { provider } = createTestProvider();
		engine.registerProvider(provider);
		await engine.setLegalHold({
			id: "hold-1",
			subjectId: "subject-2",
			subjectKind: "customer",
			reasonCode: "litigation",
			reasonDetails: "legal hold active",
			createdAt: new Date().toISOString(),
		});

		const result = await engine.submitRequest({
			subjectId: "subject-2",
			subjectKind: "customer",
			right: "erasure",
			requestedBy: "user-2",
			idempotencyKey: "request-key-2",
		});

		expect(result.request.status).toBe("denied");
		expect(result.operations).toHaveLength(1);
		expect(result.operations[0].status).toBe("blocked");
		expect(result.operations[0].errorCode).toBe("LEGAL_HOLD_ACTIVE");
	});

	it("denies requests when no providers are registered", async () => {
		const engine = new GdprWorkflowEngine();
		const result = await engine.submitRequest({
			subjectId: "subject-no-provider",
			subjectKind: "customer",
			right: "access",
			requestedBy: "user-3",
			idempotencyKey: "request-key-3",
		});

		expect(result.request.status).toBe("denied");
		expect(result.request.errorCode).toBe("NO_PROVIDERS");
		expect(result.operations).toHaveLength(0);
	});

	it("stores and updates consent snapshots by subject purpose", async () => {
		const engine = new GdprWorkflowEngine();
		await engine.setConsent({
			subjectId: "subject-consent",
			subjectKind: "customer",
			purpose: "marketing",
			granted: true,
		});
		await engine.setConsent({
			subjectId: "subject-consent",
			subjectKind: "customer",
			purpose: "analytics",
			granted: false,
		});

		const consents = await engine.getConsents("subject-consent", "customer");
		expect(consents).toHaveLength(2);

		await engine.setConsent({
			subjectId: "subject-consent",
			subjectKind: "customer",
			purpose: "marketing",
			granted: false,
		});

		const updated = await engine.getConsents("subject-consent", "customer");
		expect(updated).toHaveLength(2);
		const marketing = updated.find((entry) => entry.purpose === "marketing");
		expect(marketing?.granted).toBe(false);
	});

	it("supports hasConsent grantConsent and revokeConsent operations", async () => {
		const engine = new GdprWorkflowEngine();
		await engine.grantConsent({
			subjectId: "subject-consent-op",
			subjectKind: "customer",
			purpose: "marketing",
		});

		expect(await engine.hasConsent({
			subjectId: "subject-consent-op",
			subjectKind: "customer",
			purpose: "marketing",
		})).toBe(true);
		expect(await engine.hasConsent({
			subjectId: "subject-consent-op",
			subjectKind: "customer",
		})).toBe(true);

		await engine.revokeConsent({
			subjectId: "subject-consent-op",
			subjectKind: "customer",
			purpose: "marketing",
		});
		expect(await engine.hasConsent({
			subjectId: "subject-consent-op",
			subjectKind: "customer",
			purpose: "marketing",
		})).toBe(false);
		expect(await engine.getConsents("subject-consent-op", "customer")).toHaveLength(0);
	});

	it("persists consent and legal-hold state through shared workflow stores", async () => {
		const consentStore = new InMemoryConsentStore();
		const legalHoldStore = new InMemoryLegalHoldStore();
		const writer = new GdprWorkflowEngine({
			consentStore,
			legalHoldStore,
		});
		await writer.setConsent({
			subjectId: "subject-shared",
			subjectKind: "customer",
			purpose: "analytics",
			granted: true,
			updatedAt: "2026-04-07T00:00:00.000Z",
		});
		await writer.setLegalHold({
			id: "shared-hold",
			subjectId: "subject-shared",
			subjectKind: "customer",
			reasonCode: "support",
			reasonDetails: "manual hold",
			createdAt: "2026-04-07T00:00:00.000Z",
		});

		const reader = new GdprWorkflowEngine({
			consentStore,
			legalHoldStore,
		});
		const consents = await reader.getConsents("subject-shared", "customer");
		const holds = await reader.getLegalHolds({ subjectId: "subject-shared", subjectKind: "customer" });

		expect(consents).toHaveLength(1);
		expect(consents[0].purpose).toBe("analytics");
		expect(consents[0].granted).toBe(true);
		expect(holds).toHaveLength(1);
		expect(holds[0].reasonCode).toBe("support");
	});

	it("uses repository-backed stores when collections are provided", async () => {
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

		const writer = new GdprWorkflowEngine({
			consentStore: createConsentStore(consentCollection),
			legalHoldStore: createLegalHoldStore(legalHoldCollection),
		});
		await writer.setConsent({
			subjectId: "repo-subject",
			subjectKind: "customer",
			purpose: "analytics",
			granted: true,
		});
		await writer.setLegalHold({
			id: "repo-hold",
			subjectId: "repo-subject",
			subjectKind: "customer",
			reasonCode: "support",
			reasonDetails: "repository backed",
			createdAt: "2026-04-07T00:00:00.000Z",
		});

		const reader = new GdprWorkflowEngine({
			consentStore: createConsentStore(consentCollection),
			legalHoldStore: createLegalHoldStore(legalHoldCollection),
		});
		const consents = await reader.getConsents("repo-subject", "customer");
		const holds = await reader.getLegalHolds({ subjectId: "repo-subject", subjectKind: "customer" });

		expect(consents).toHaveLength(1);
		expect(consents[0].subjectId).toBe("repo-subject");
		expect(consents[0].purpose).toBe("analytics");
		expect(holds).toHaveLength(1);
		expect(holds[0].reasonCode).toBe("support");
	});

	it("shares request, operation, and audit state through shared in-memory stores", async () => {
		const requestStore = new InMemoryRequestStore();
		const operationStore = new InMemoryOperationStore();
		const auditStore = new InMemoryAuditStore();
		const exportStore = new InMemoryExportStore();
		const writer = new GdprWorkflowEngine({
			requestStore,
			operationStore,
			auditStore,
			exportStore,
		});
		const reader = new GdprWorkflowEngine({
			requestStore,
			operationStore,
			auditStore,
			exportStore,
		});
		const { provider } = createTestProvider();
		writer.registerProvider(provider);

		const result = await writer.submitRequest({
			subjectId: "shared-subject",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "user-shared",
			idempotencyKey: "shared-request",
		});
		const persistedRequest = await reader.getRequestById(result.request.requestId);
		const persistedOperations = await reader.getOperationsForRequest(result.request.requestId);
		const persistedAudit = await reader.getAuditLog(result.request.requestId);

		expect(persistedRequest?.requestId).toBe(result.request.requestId);
		expect(persistedOperations).toHaveLength(1);
		expect(persistedAudit.length).toBeGreaterThanOrEqual(2);
	});

	it("stores request, operation, and audit state in repository-backed stores", async () => {
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
			startedAt?: string;
			finishedAt?: string;
		}>();
		const auditCollection = new FakeStorageCollection<{
			id: string;
			requestId?: string;
			operationId?: string;
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
		const writer = new GdprWorkflowEngine({
			requestStore: createRequestStore(requestCollection),
			operationStore: createOperationStore(operationCollection),
			auditStore: createAuditStore(auditCollection),
			exportStore: createExportStore(exportCollection),
		});
		const { provider } = createTestProvider();
		writer.registerProvider(provider);

		const result = await writer.submitRequest({
			subjectId: "repo-state",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "repo-user",
			idempotencyKey: "repo-request-key",
		});

		const requestRows = await requestCollection.query({ where: { subjectId: "repo-state", subjectKind: "customer" } });
		const operationRows = await operationCollection.query({ where: { requestId: result.request.requestId } });
		const auditRows = await auditCollection.query({ where: { requestId: result.request.requestId } });
		const exportRows = await exportCollection.query({ where: { requestId: result.request.requestId } });

		expect(requestRows.items).toHaveLength(1);
		expect(operationRows.items).toHaveLength(1);
		expect(auditRows.items.length).toBeGreaterThanOrEqual(2);
		expect(exportRows.items).toHaveLength(1);
		expect(requestRows.items[0]?.data.requestId).toBe(result.request.requestId);
		expect(operationRows.items[0]?.data.providerId).toBe("test-provider");
		expect(exportRows.items[0]?.data.providerId).toBe("test-provider");

		const duplicateResult = await writer.submitRequest({
			subjectId: "repo-state",
			subjectKind: "customer",
			right: "portability",
			requestedBy: "repo-user",
			idempotencyKey: "repo-request-key",
		});
		expect(duplicateResult.request.id).toBe(result.request.id);
		const requestRowsAfter = await requestCollection.query({ where: { subjectId: "repo-state", subjectKind: "customer" } });
		const operationRowsAfter = await operationCollection.query({ where: { requestId: result.request.requestId } });
		const exportRowsAfter = await exportCollection.query({ where: { requestId: result.request.requestId } });
		expect(requestRowsAfter.items).toHaveLength(1);
		expect(operationRowsAfter.items).toHaveLength(1);
		expect(exportRowsAfter.items).toHaveLength(1);
	});

	it("does not block requests when legal hold expires", async () => {
		const engine = new GdprWorkflowEngine({ now: () => "2026-04-07T13:00:00.000Z" });
		const { provider } = createTestProvider();
		engine.registerProvider(provider);
		await engine.setLegalHold({
			id: "hold-expired",
			subjectId: "subject-3",
			subjectKind: "customer",
			reasonCode: "old",
			reasonDetails: "expired hold",
			createdAt: "2026-04-06T12:00:00.000Z",
			expiresAt: "2026-04-07T12:00:00.000Z",
		});

		const result = await engine.submitRequest({
			subjectId: "subject-3",
			subjectKind: "customer",
			right: "erasure",
			requestedBy: "user-4",
			idempotencyKey: "request-key-4",
		});

		expect(result.request.status).toBe("completed");
		expect(result.operations[0]?.status).toBe("completed");
	});
});
