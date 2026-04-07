import type {
	type GdprAuditLogRecord,
	type GdprConsentPurpose,
	type GdprConsentRecord,
	type GdprDataSubjectKind,
	type GdprLegalHoldRecord,
	type GdprExportRecord,
	type GdprOperationRecord,
	type GdprRequestRecord,
} from "../types.js";

export interface GdprStorageCollection<T> {
	get(id: string): Promise<T | null> | T | null;
	put(id: string, data: T): Promise<void> | void;
	delete(id: string): Promise<boolean> | boolean;
	query?(options: {
		where?: Record<string, string>;
	}): Promise<{ items: Array<{ id: string; data: T }> }>|{ items: Array<{ id: string; data: T }> };
}

export interface GdprConsentStore {
	listBySubject(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<GdprConsentRecord[]>;
	set(record: GdprConsentRecord): Promise<void>;
	delete(input: {
		subjectId: string;
		subjectKind: GdprDataSubjectKind;
		purpose: GdprConsentPurpose;
	}): Promise<void>;
}

export interface GdprLegalHoldStore {
	listBySubject(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<GdprLegalHoldRecord[]>;
	set(record: GdprLegalHoldRecord): Promise<void>;
	clear(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<void>;
}

export interface GdprRequestStore {
	getById(requestId: string): Promise<GdprRequestRecord | null>;
	findByDedupeKey(idempotencyKey: string): Promise<GdprRequestRecord | null>;
	upsert(request: GdprRequestRecord): Promise<void>;
	list(): Promise<GdprRequestRecord[]>;
}

export interface GdprOperationStore {
	upsert(operation: GdprOperationRecord): Promise<void>;
	getByDedupeKey(dedupeKey: string): Promise<GdprOperationRecord | null>;
	listByRequestId(requestId: string): Promise<GdprOperationRecord[]>;
}

export interface GdprAuditStore {
	add(event: GdprAuditLogRecord): Promise<void>;
	listByRequestId(requestId?: string): Promise<GdprAuditLogRecord[]>;
}

export interface GdprExportStore {
	upsert(record: GdprExportRecord): Promise<void>;
	listByRequestId(requestId: string): Promise<GdprExportRecord[]>;
}

interface QueryBySubject {
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
}

type MaybePromise<T> = T | Promise<T>;

function asPromise<T>(value: MaybePromise<T>): Promise<T> {
	return Promise.resolve(value);
}

function compareByCreatedAtAscending(a: { createdAt: string }, b: { createdAt: string }): number {
	return a.createdAt.localeCompare(b.createdAt);
}

function compareByStartedAtAscending(
	a: { startedAt?: string; createdAt?: string },
	b: { startedAt?: string; createdAt?: string },
): number {
	return (a.startedAt ?? a.createdAt ?? "").localeCompare(b.startedAt ?? b.createdAt ?? "");
}

export class InMemoryConsentStore implements GdprConsentStore {
	private entries = new Map<string, GdprConsentRecord>();

	private key(input: { subjectId: string; subjectKind: string; purpose: string }): string {
		return `${input.subjectKind}:${input.subjectId}:${input.purpose}`;
	}

	public async listBySubject(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<GdprConsentRecord[]> {
		const list = [...this.entries.values()].filter(
			(entry) => entry.subjectId === subjectId && entry.subjectKind === subjectKind,
		);
		return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	public async set(record: GdprConsentRecord): Promise<void> {
		this.entries.set(this.key(record), record);
	}

	public async delete(input: {
		subjectId: string;
		subjectKind: GdprDataSubjectKind;
		purpose: GdprConsentPurpose;
	}): Promise<void> {
		this.entries.delete(this.key(input));
	}
}

function consentKey(input: { subjectId: string; subjectKind: string; purpose: string }): string {
	return `${input.subjectKind}:${input.subjectId}:${input.purpose}`;
}

export function createConsentStore(collection?: GdprStorageCollection<GdprConsentRecord>): GdprConsentStore {
	if (!collection) return new InMemoryConsentStore();
	return new StorageConsentStore(collection);
}

class StorageConsentStore implements GdprConsentStore {
	public constructor(private readonly collection: GdprStorageCollection<GdprConsentRecord>) {}

	public async listBySubject(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<GdprConsentRecord[]> {
		const rows = await this.query({
			subjectId,
			subjectKind,
		});
		return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	public async set(record: GdprConsentRecord): Promise<void> {
		await asPromise(this.collection.put(consentKey(record), record));
	}

	public async delete(input: {
		subjectId: string;
		subjectKind: GdprDataSubjectKind;
		purpose: GdprConsentPurpose;
	}): Promise<void> {
		await asPromise(this.collection.delete(consentKey(input)));
	}

	private async query(where: QueryBySubject): Promise<GdprConsentRecord[]> {
		if (!this.collection.query) {
			throw new Error("Consent persistence collection requires query support.");
		}
		const result = await asPromise(
			this.collection.query({
				where: { ...where },
			}),
		);
		return result.items.map((row) => row.data);
	}
}

export class InMemoryLegalHoldStore implements GdprLegalHoldStore {
	private entries = new Map<string, GdprLegalHoldRecord>();

	public async listBySubject(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<GdprLegalHoldRecord[]> {
		return [...this.entries.values()]
			.filter((entry) => entry.subjectId === subjectId && entry.subjectKind === subjectKind)
			.sort((a, b) => compareByCreatedAtAscending(a, b));
	}

	public async set(record: GdprLegalHoldRecord): Promise<void> {
		this.entries.set(record.id, record);
	}

	public async clear(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<void> {
		for (const [id, row] of this.entries.entries()) {
			if (row.subjectId === subjectId && row.subjectKind === subjectKind) {
				this.entries.delete(id);
			}
		}
	}
}

export function createLegalHoldStore(collection?: GdprStorageCollection<GdprLegalHoldRecord>): GdprLegalHoldStore {
	if (!collection) return new InMemoryLegalHoldStore();
	return new StorageLegalHoldStore(collection);
}

class StorageLegalHoldStore implements GdprLegalHoldStore {
	public constructor(private readonly collection: GdprStorageCollection<GdprLegalHoldRecord>) {}

	public async listBySubject(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<GdprLegalHoldRecord[]> {
		const rows = await this.query({
			subjectId,
			subjectKind,
		});
		return rows.sort(compareByCreatedAtAscending);
	}

	public async set(record: GdprLegalHoldRecord): Promise<void> {
		await asPromise(this.collection.put(record.id, record));
	}

	public async clear(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<void> {
		const rows = await this.query({
			subjectId,
			subjectKind,
		});
		for (const hold of rows) {
			await asPromise(this.collection.delete(hold.id));
		}
	}

	private async query(where: QueryBySubject): Promise<GdprLegalHoldRecord[]> {
		if (!this.collection.query) {
			throw new Error("Legal hold persistence collection requires query support.");
		}
		const result = await asPromise(this.collection.query({ where }));
		return result.items.map((row) => row.data);
	}
}

export class InMemoryRequestStore implements GdprRequestStore {
	private entries = new Map<string, GdprRequestRecord>();
	private requestsByDedupe = new Map<string, string>();

	public async getById(requestId: string): Promise<GdprRequestRecord | null> {
		return this.entries.get(requestId) ?? null;
	}

	public async findByDedupeKey(idempotencyKey: string): Promise<GdprRequestRecord | null> {
		const requestId = this.requestsByDedupe.get(idempotencyKey);
		if (!requestId) return null;
		return this.entries.get(requestId) ?? null;
	}

	public async upsert(request: GdprRequestRecord): Promise<void> {
		this.entries.set(request.requestId, request);
		this.requestsByDedupe.set(request.idempotencyKey, request.requestId);
	}

	public async list(): Promise<GdprRequestRecord[]> {
		return [...this.entries.values()].sort(compareByCreatedAtAscending);
	}
}

export function createRequestStore(collection?: GdprStorageCollection<GdprRequestRecord>): GdprRequestStore {
	if (!collection) return new InMemoryRequestStore();
	return new StorageRequestStore(collection);
}

class StorageRequestStore implements GdprRequestStore {
	public constructor(private readonly collection: GdprStorageCollection<GdprRequestRecord>) {}

	public async getById(requestId: string): Promise<GdprRequestRecord | null> {
		return (await asPromise(this.collection.get(requestId))) ?? null;
	}

	public async findByDedupeKey(idempotencyKey: string): Promise<GdprRequestRecord | null> {
		const rows = await this.query({
			idempotencyKey,
		});
		return rows[0] ?? null;
	}

	public async upsert(request: GdprRequestRecord): Promise<void> {
		await asPromise(this.collection.put(request.requestId, request));
	}

	public async list(): Promise<GdprRequestRecord[]> {
		const rows = await this.query({});
		return rows.sort(compareByCreatedAtAscending);
	}

	private async query(where: Record<string, string>): Promise<GdprRequestRecord[]> {
		if (!this.collection.query) {
			throw new Error("Request persistence collection requires query support.");
		}
		const result = await asPromise(this.collection.query({ where }));
		return result.items.map((row) => row.data);
	}
}

export class InMemoryOperationStore implements GdprOperationStore {
	private entries = new Map<string, GdprOperationRecord>();
	private byDedupe = new Map<string, string>();
	private byRequest = new Map<string, Set<string>>();

	public async upsert(operation: GdprOperationRecord): Promise<void> {
		this.entries.set(operation.id, operation);
		this.byDedupe.set(operation.dedupeKey, operation.id);
		const byRequest = this.byRequest.get(operation.requestId) ?? new Set<string>();
		byRequest.add(operation.id);
		this.byRequest.set(operation.requestId, byRequest);
	}

	public async getByDedupeKey(dedupeKey: string): Promise<GdprOperationRecord | null> {
		const operationId = this.byDedupe.get(dedupeKey);
		if (!operationId) return null;
		return this.entries.get(operationId) ?? null;
	}

	public async listByRequestId(requestId: string): Promise<GdprOperationRecord[]> {
		const ids = this.byRequest.get(requestId) ?? new Set<string>();
		return [...ids]
			.map((id) => this.entries.get(id))
			.filter((operation): operation is GdprOperationRecord => operation !== undefined)
			.sort(compareByStartedAtAscending);
	}
}

export function createOperationStore(collection?: GdprStorageCollection<GdprOperationRecord>): GdprOperationStore {
	if (!collection) return new InMemoryOperationStore();
	return new StorageOperationStore(collection);
}

class StorageOperationStore implements GdprOperationStore {
	public constructor(private readonly collection: GdprStorageCollection<GdprOperationRecord>) {}

	public async upsert(operation: GdprOperationRecord): Promise<void> {
		await asPromise(this.collection.put(operation.id, operation));
	}

	public async getByDedupeKey(dedupeKey: string): Promise<GdprOperationRecord | null> {
		const rows = await this.query({ dedupeKey });
		return rows[0] ?? null;
	}

	public async listByRequestId(requestId: string): Promise<GdprOperationRecord[]> {
		const rows = await this.query({ requestId });
		return rows.sort(compareByStartedAtAscending);
	}

	private async query(where: Record<string, string>): Promise<GdprOperationRecord[]> {
		if (!this.collection.query) {
			throw new Error("Operation persistence collection requires query support.");
		}
		const result = await asPromise(this.collection.query({ where }));
		return result.items.map((row) => row.data);
	}
}

export class InMemoryExportStore implements GdprExportStore {
	private entries = new Map<string, GdprExportRecord>();
	private byRequest = new Map<string, Set<string>>();

	public async upsert(record: GdprExportRecord): Promise<void> {
		this.entries.set(record.id, record);
		const byRequest = this.byRequest.get(record.requestId) ?? new Set<string>();
		byRequest.add(record.id);
		this.byRequest.set(record.requestId, byRequest);
	}

	public async listByRequestId(requestId: string): Promise<GdprExportRecord[]> {
		const ids = this.byRequest.get(requestId) ?? new Set<string>();
		return [...ids]
			.map((id) => this.entries.get(id))
			.filter((record): record is GdprExportRecord => record !== undefined)
			.sort(compareByCreatedAtAscending);
	}
}

export function createExportStore(collection?: GdprStorageCollection<GdprExportRecord>): GdprExportStore {
	if (!collection) return new InMemoryExportStore();
	return new StorageExportStore(collection);
}

class StorageExportStore implements GdprExportStore {
	public constructor(private readonly collection: GdprStorageCollection<GdprExportRecord>) {}

	public async upsert(record: GdprExportRecord): Promise<void> {
		await asPromise(this.collection.put(record.id, record));
	}

	public async listByRequestId(requestId: string): Promise<GdprExportRecord[]> {
		const rows = await this.query({ requestId });
		return rows.sort(compareByCreatedAtAscending);
	}

	private async query(where: Record<string, string>): Promise<GdprExportRecord[]> {
		if (!this.collection.query) {
			throw new Error("Export persistence collection requires query support.");
		}
		const result = await asPromise(this.collection.query({ where }));
		return result.items.map((row) => row.data);
	}
}

export class InMemoryAuditStore implements GdprAuditStore {
	private entries = new Map<string, GdprAuditLogRecord[]>();

	public async add(event: GdprAuditLogRecord): Promise<void> {
		if (!event.requestId) return;
		const rows = this.entries.get(event.requestId) ?? [];
		rows.push(event);
		this.entries.set(event.requestId, rows);
	}

	public async listByRequestId(requestId?: string): Promise<GdprAuditLogRecord[]> {
		if (!requestId) {
			const all: GdprAuditLogRecord[] = [];
			for (const rows of this.entries.values()) {
				all.push(...rows);
			}
			return all.sort(compareByCreatedAtAscending);
		}
		return [...(this.entries.get(requestId) ?? [])].sort(compareByCreatedAtAscending);
	}
}

export function createAuditStore(collection?: GdprStorageCollection<GdprAuditLogRecord>): GdprAuditStore {
	if (!collection) return new InMemoryAuditStore();
	return new StorageAuditStore(collection);
}

class StorageAuditStore implements GdprAuditStore {
	public constructor(private readonly collection: GdprStorageCollection<GdprAuditLogRecord>) {}

	public async add(event: GdprAuditLogRecord): Promise<void> {
		await asPromise(this.collection.put(event.id, event));
	}

	public async listByRequestId(requestId?: string): Promise<GdprAuditLogRecord[]> {
		const rows = requestId ? await this.query({ requestId }) : await this.query({});
		return rows.sort(compareByCreatedAtAscending);
	}

	private async query(where: Record<string, string>): Promise<GdprAuditLogRecord[]> {
		if (!this.collection.query) {
			throw new Error("Audit persistence collection requires query support.");
		}
		const result = await asPromise(this.collection.query({ where }));
		return result.items.map((row) => row.data);
	}
}
