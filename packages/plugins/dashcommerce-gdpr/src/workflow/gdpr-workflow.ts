import { createHash, randomUUID } from "node:crypto";
import {
	type GdprAuditEvent,
	type GdprAuditLogRecord,
	type GdprConsentPurpose,
	type GdprConsentRecord,
	type GdprDataSubject,
	type GdprDataSubjectKind,
	type GdprLegalHoldRecord,
	type GdprOperationAction,
	type GdprOperationRecord,
	type GdprOperationStatus,
	type GdprOperationResult,
	type GdprPersonalDataProvider,
	type GdprProviderStatus,
	type GdprRequestRecord,
	type GdprExportRecord,
	type GdprRequestStatus,
	type GdprRight,
} from "../types.js";
import {
	type GdprConsentStore,
	type GdprLegalHoldStore,
	type GdprRequestStore,
	type GdprOperationStore,
	type GdprAuditStore,
	type GdprExportStore,
	createConsentStore,
	createLegalHoldStore,
	createRequestStore,
	createOperationStore,
	createAuditStore,
	createExportStore,
} from "./gdpr-persistence.js";

interface GdprWorkflowConfig {
	now: () => string;
	consentStore?: GdprConsentStore;
	legalHoldStore?: GdprLegalHoldStore;
	requestStore?: GdprRequestStore;
	operationStore?: GdprOperationStore;
	auditStore?: GdprAuditStore;
	exportStore?: GdprExportStore;
}

interface SubmitRequestInput {
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	subjectAnchor?: GdprDataSubject["anchor"];
	right: GdprRight;
	requestedBy: string;
	scope?: Record<string, unknown>;
	idempotencyKey?: string;
	legalHoldOk?: boolean;
}

interface SubmitRequestResult {
	request: GdprRequestRecord;
	operations: GdprOperationRecord[];
}

type ProviderWithMeta = {
	provider: GdprPersonalDataProvider;
};

function stableStringify(value: unknown): string {
	const sorted = sortUnknown(value);
	return JSON.stringify(sorted);
}

function sortUnknown(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortUnknown);
	}
	if (value && typeof value === "object") {
		const source = value as Record<string, unknown>;
		const ordered: Record<string, unknown> = {};
		for (const key of Object.keys(source).toSorted()) {
			ordered[key] = sortUnknown(source[key]);
		}
		return ordered;
	}
	return value;
}

function normalizeSubjectAnchor(anchor?: GdprDataSubject["anchor"]): GdprDataSubject["anchor"] | undefined {
	if (!anchor) return undefined;
	const normalized: GdprDataSubject["anchor"] = {};
	if (typeof anchor.orderId === "string" && anchor.orderId.length > 0) {
		normalized.orderId = anchor.orderId;
	}
	if (typeof anchor.cartId === "string" && anchor.cartId.length > 0) {
		normalized.cartId = anchor.cartId;
	}
	if (typeof anchor.emailHash === "string" && anchor.emailHash.length > 0) {
		normalized.emailHash = anchor.emailHash;
	}
	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function nowIso(now: () => string): string {
	return now();
}

function isExpiredHold(hold: GdprLegalHoldRecord, now: () => string): boolean {
	if (!hold.expiresAt) return false;
	return hold.expiresAt <= now();
}

function mapRightToAction(right: GdprRight): GdprOperationAction {
	switch (right) {
		case "access":
		case "portability":
			return "export";
		case "erasure":
			return "erase";
		case "restriction":
		case "objection":
			return "anonymize";
		case "rectification":
			return "rectify";
		default:
			return "export";
	}
}

function requestStatusFromOperationStatuses(
	operationStatuses: GdprOperationStatus[],
): Exclude<GdprRequestStatus, "received" | "queued"> {
	if (operationStatuses.length === 0) {
		return "failed";
	}

	const hasFailed = operationStatuses.some((status) => status === "failed");
	const hasBlocked = operationStatuses.some((status) => status === "blocked");
	const hasCompleted = operationStatuses.some((status) => status === "completed");
	const hasPartial = operationStatuses.some((status) => status === "partial");
	const hasSkipped = operationStatuses.some((status) => status === "skipped");

	if (hasFailed) {
		return "failed";
	}
	if (operationStatuses.every((status) => status === "blocked")) {
		return "denied";
	}
	if (hasCompleted && (hasBlocked || hasPartial || hasSkipped)) {
		return "partially_completed";
	}
	if (hasCompleted || operationStatuses.every((status) => status === "skipped")) {
		return "completed";
	}
	if (hasPartial) {
		return "partially_completed";
	}
	if (hasBlocked && hasSkipped) {
		return "partially_completed";
	}
	return "running";
}

function buildDedupeKey({
	requestId,
	subjectId,
	providerId,
	action,
}: {
	requestId: string;
	subjectId: string;
	providerId: string;
	action: GdprOperationAction;
}): string {
	return `${requestId}:${providerId}:${action}:${subjectId}`;
}

export class GdprWorkflowEngine {
	private providers = new Map<string, ProviderWithMeta>();
	private readonly consentStore: GdprConsentStore;
	private readonly legalHoldStore: GdprLegalHoldStore;
	private readonly requestStore: GdprRequestStore;
	private readonly operationStore: GdprOperationStore;
	private readonly auditStore: GdprAuditStore;
	private readonly exportStore: GdprExportStore;
	private readonly now: () => string;

	public constructor(config: Partial<GdprWorkflowConfig> = {}) {
		this.now = config.now ?? (() => new Date().toISOString());
		this.consentStore = config.consentStore ?? createConsentStore();
		this.legalHoldStore = config.legalHoldStore ?? createLegalHoldStore();
		this.requestStore = config.requestStore ?? createRequestStore();
		this.operationStore = config.operationStore ?? createOperationStore();
		this.auditStore = config.auditStore ?? createAuditStore();
		this.exportStore = config.exportStore ?? createExportStore();
	}

	public registerProvider(provider: GdprPersonalDataProvider): void {
		if (this.providers.has(provider.id)) return;
		this.providers.set(provider.id, { provider });
		void this.logEvent({
			requestId: undefined,
			operationId: undefined,
			providerId: provider.id,
			actorId: undefined,
			eventType: "request.completed",
			eventSubType: "provider.registered",
			message: `provider registered`,
		});
	}

	public getProviders(): string[] {
		return [...this.providers.keys()];
	}

	public async setLegalHold(record: GdprLegalHoldRecord): Promise<void> {
		await this.legalHoldStore.set(record);
	}

	public async clearLegalHolds(subject: GdprDataSubject): Promise<void> {
		await this.legalHoldStore.clear(subject.subjectId, subject.subjectKind);
	}

	public async getLegalHolds(subject: GdprDataSubject): Promise<GdprLegalHoldRecord[]> {
		const holds = await this.legalHoldStore.listBySubject(subject.subjectId, subject.subjectKind);
		return holds.filter((hold) => !isExpiredHold(hold, this.now));
	}

	public async setConsent(input: {
		subjectId: string;
		subjectKind: GdprDataSubjectKind;
		purpose: GdprConsentPurpose;
		granted: boolean;
		updatedAt?: string;
	}): Promise<GdprConsentRecord> {
		const consent: GdprConsentRecord = {
			id: randomUUID(),
			subjectId: input.subjectId,
			subjectKind: input.subjectKind,
			purpose: input.purpose,
			granted: input.granted,
			updatedAt: input.updatedAt ?? nowIso(this.now),
		};
		await this.consentStore.set(consent);
		return consent;
	}

	public async grantConsent(input: {
		subjectId: string;
		subjectKind: GdprDataSubjectKind;
		purpose: GdprConsentPurpose;
	}): Promise<GdprConsentRecord> {
		return this.setConsent({
			subjectId: input.subjectId,
			subjectKind: input.subjectKind,
			purpose: input.purpose,
			granted: true,
		});
	}

	public async revokeConsent(input: {
		subjectId: string;
		subjectKind: GdprDataSubjectKind;
		purpose: GdprConsentPurpose;
	}): Promise<void> {
		await this.consentStore.delete(input);
	}

	public async getConsents(subjectId: string, subjectKind: GdprDataSubjectKind): Promise<GdprConsentRecord[]> {
		return this.consentStore.listBySubject(subjectId, subjectKind);
	}

	public async hasConsent(input: {
		subjectId: string;
		subjectKind: GdprDataSubjectKind;
		purpose?: GdprConsentPurpose;
	}): Promise<boolean> {
		const consents = await this.getConsents(input.subjectId, input.subjectKind);
		if (input.purpose) {
			const consent = consents.find((entry) => entry.purpose === input.purpose);
			return consent?.granted ?? false;
		}
		return consents.some((entry) => entry.granted);
	}

	public async getRequestById(requestId: string): Promise<GdprRequestRecord | null> {
		return this.requestStore.getById(requestId);
	}

	public async listRequests(): Promise<GdprRequestRecord[]> {
		return this.requestStore.list();
	}

	public async getOperationsForRequest(requestId: string): Promise<GdprOperationRecord[]> {
		return this.operationStore.listByRequestId(requestId);
	}

	public async getAuditLog(requestId?: string): Promise<GdprAuditLogRecord[]> {
		return this.auditStore.listByRequestId(requestId);
	}

	public async submitRequest(input: SubmitRequestInput): Promise<SubmitRequestResult> {
		const subject: GdprDataSubject = {
			subjectId: input.subjectId,
			subjectKind: input.subjectKind,
			anchor: normalizeSubjectAnchor(input.subjectAnchor),
		};
		const scopeRecord: Record<string, unknown> = { ...input.scope };
		if (subject.anchor) {
			scopeRecord.subjectAnchor = subject.anchor;
		}

		const idempotencyKey =
			input.idempotencyKey ??
			`gdpr_${subject.subjectId}_${subject.subjectKind}_${input.right}_${createHash("sha256")
				.update(stableStringify(scopeRecord))
				.digest("base64url")}`;
		const existingRequest = await this.requestStore.findByDedupeKey(idempotencyKey);
		if (existingRequest) {
			return {
				request: existingRequest,
				operations: await this.getOperationsForRequest(existingRequest.requestId),
			};
		}

		const subjectHash = createHash("sha256")
			.update(
				[
					input.subjectId,
					input.subjectKind,
					input.right,
					input.requestedBy,
					stableStringify(scopeRecord),
				].join("|"),
			)
			.digest("hex");

		const requestId = `req_${randomUUID()}`;
		const request: GdprRequestRecord = {
			id: randomUUID(),
			requestId,
			subjectId: input.subjectId,
			subjectKind: input.subjectKind,
			right: input.right,
			status: "received",
			scope: Object.keys(scopeRecord).length > 0 ? stableStringify(scopeRecord) : undefined,
			requestedBy: input.requestedBy,
			requestHash: subjectHash,
			createdAt: nowIso(this.now),
			updatedAt: nowIso(this.now),
			idempotencyKey,
		};
		await this.requestStore.upsert(request);
		await this.logEvent({
			requestId,
			operationId: undefined,
			providerId: undefined,
			actorId: input.requestedBy,
			eventType: "request.created",
			message: "request submitted",
			requestContext: JSON.stringify({ right: input.right, subject }),
		});

		const operations: GdprOperationRecord[] = [];
		const providerEntries = [...this.providers.values()];
		if (providerEntries.length === 0) {
			request.status = "denied";
			request.errorCode = "NO_PROVIDERS";
			request.resultSummary = "No providers were registered for this module.";
			request.updatedAt = nowIso(this.now);
			request.completedAt = nowIso(this.now);
			await this.requestStore.upsert(request);
			await this.logEvent({
				requestId,
				eventType: "request.denied",
				message: request.resultSummary,
				reasonCode: request.errorCode,
			});
			return {
				request,
				operations,
			};
		}
		request.status = "queued";
		request.startedAt = nowIso(this.now);
		const executedOperations = await this.processRequestOperations(request, subject, Boolean(input.legalHoldOk), { skipExisting: false });
		operations.push(...executedOperations);
		const operationStatuses = operations.map((operation) => operation.status);
		request.status = requestStatusFromOperationStatuses(operationStatuses);
		request.updatedAt = nowIso(this.now);
		request.completedAt = nowIso(this.now);
		request.resultSummary = `operations:${operationStatuses.join(",")}`;
		await this.requestStore.upsert(request);
		await this.logEvent({
			requestId,
			operationId: undefined,
			eventType: request.status === "completed" ? "request.completed" : "request.denied",
			message: `request transitioned to ${request.status}`,
		});

		return {
			request,
			operations,
		};
	}

	public async replayRequest(requestId: string): Promise<GdprRequestRecord | null> {
		const request = await this.requestStore.getById(requestId);
		if (!request) return null;
		if (request.status === "completed") return request;
		const subject: GdprDataSubject = {
			subjectId: request.subjectId,
			subjectKind: request.subjectKind,
			anchor: this.getAnchorFromScope(request.scope),
		};
		request.status = "running";
		request.startedAt = nowIso(this.now);
		request.errorCode = undefined;
		request.resultSummary = undefined;

		const operations = await this.processRequestOperations(request, subject, false, { skipExisting: true });
		const operationStatuses = operations.map((operation) => operation.status);
		request.status = operationStatuses.length ? requestStatusFromOperationStatuses(operationStatuses) : "denied";
		request.updatedAt = nowIso(this.now);
		request.completedAt = nowIso(this.now);
		request.resultSummary = `operations:${operationStatuses.join(",")}`;
		await this.requestStore.upsert(request);
		await this.logEvent({
			requestId,
			operationId: undefined,
			eventType: request.status === "completed" ? "request.completed" : "request.denied",
			message: `request transitioned to ${request.status}`,
		});
		return request;
	}

	private getAnchorFromScope(scope?: string): GdprDataSubject["anchor"] | undefined {
		if (!scope) return undefined;
		try {
			const parsed = JSON.parse(scope) as unknown;
			if (typeof parsed !== "object" || parsed === null) return undefined;
			const record = parsed as { subjectAnchor?: unknown };
			if (typeof record.subjectAnchor !== "object" || record.subjectAnchor === null) return undefined;
			const candidate = record.subjectAnchor as { orderId?: unknown; cartId?: unknown; emailHash?: unknown };
			const anchor: GdprDataSubject["anchor"] = {};
			if (typeof candidate.orderId === "string" && candidate.orderId.length > 0) {
				anchor.orderId = candidate.orderId;
			}
			if (typeof candidate.cartId === "string" && candidate.cartId.length > 0) {
				anchor.cartId = candidate.cartId;
			}
			if (typeof candidate.emailHash === "string" && candidate.emailHash.length > 0) {
				anchor.emailHash = candidate.emailHash;
			}
			return Object.keys(anchor).length > 0 ? anchor : undefined;
		} catch {
			return undefined;
		}
	}

	private async processRequestOperations(
		request: GdprRequestRecord,
		subject: GdprDataSubject,
		legalHoldOk: boolean,
		options: { skipExisting: boolean },
	): Promise<GdprOperationRecord[]> {
		const providerEntries = [...this.providers.values()];
		if (providerEntries.length === 0) {
			return [];
		}
		const action = mapRightToAction(request.right);
		const operations: GdprOperationRecord[] = [];
		for (const { provider } of providerEntries) {
			const dedupeKey = buildDedupeKey({
				requestId: request.requestId,
				subjectId: subject.subjectId,
				providerId: provider.id,
				action,
			});
			if (options.skipExisting) {
				const existing = await this.operationStore.getByDedupeKey(dedupeKey);
				if (existing) {
					operations.push(existing);
					continue;
				}
			}
			const operation = await this.runProviderAction({
				request,
				provider,
				action,
				subject,
				legalHoldOk,
			});
			await this.persistOperation(operation);
			operations.push(operation);
		}
		return operations;
	}

	private async runProviderAction(params: {
		request: GdprRequestRecord;
		provider: GdprPersonalDataProvider;
		action: GdprOperationAction;
		subject: GdprDataSubject;
		legalHoldOk: boolean;
	}): Promise<GdprOperationRecord> {
		const startedAt = nowIso(this.now);
		const operation: GdprOperationRecord = {
			id: randomUUID(),
			requestId: params.request.requestId,
			providerId: params.provider.id,
			action: params.action,
			status: "running",
			attempt: 1,
			dedupeKey: buildDedupeKey({
				requestId: params.request.requestId,
				subjectId: params.subject.subjectId,
				providerId: params.provider.id,
				action: params.action,
			}),
			startedAt,
		};

		const holds = await this.getLegalHolds(params.subject);
		const actionBlockedByHold =
			holds.length > 0 &&
			["erase", "anonymize"].includes(params.action) &&
			!params.legalHoldOk;

		if (actionBlockedByHold) {
			operation.status = "blocked";
			operation.finishedAt = nowIso(this.now);
			operation.errorCode = "LEGAL_HOLD_ACTIVE";
			operation.errorDetails = `subject has ${holds.length} active legal hold(s)`;
			operation.result = JSON.stringify({
				providerId: params.provider.id,
				action: params.action,
				status: "blocked",
				processed: 0,
				requestIdempotencyKey: operation.dedupeKey,
				message: "blocked by legal hold",
			});
			return operation;
		}

		let result: GdprOperationResult;
		try {
			switch (params.action) {
				case "export": {
					const payload = await params.provider.exportData(params.subject, { dryRun: false });
					const payloadChecksum = createHash("sha256").update(stableStringify(payload)).digest("hex");
					const artifactLocation = `${params.request.requestId}/${params.provider.id}/${operation.dedupeKey}.json`;
					const payloadBytes = new TextEncoder().encode(stableStringify(payload)).byteLength;
					await this.persistExport({
						id: randomUUID(),
						requestId: params.request.requestId,
						providerId: params.provider.id,
						subjectId: params.subject.subjectId,
						subjectKind: params.subject.subjectKind,
						payloadLocation: artifactLocation,
						payloadVersion: payload.kind,
						sha256: payloadChecksum,
						sizeBytes: payloadBytes,
						createdAt: nowIso(this.now),
					});
					result = {
						providerId: params.provider.id,
						action: params.action,
						status: "success",
						processed: payload.records.length,
						requestIdempotencyKey: operation.dedupeKey,
						artifacts: {
							token: artifactLocation,
							checksum: payloadChecksum,
						},
					};
					break;
				}
				case "erase":
					result = await params.provider.eraseData(params.subject, {
						dryRun: false,
						legalHoldOk: params.legalHoldOk,
					});
					break;
				case "anonymize":
					result = await params.provider.anonymizeData(params.subject, {
						dryRun: false,
						legalHoldOk: params.legalHoldOk,
					});
					break;
				case "rectify":
					result = await params.provider.rectifyData?.(params.subject, {}) ??
						({
							providerId: params.provider.id,
							action: "rectify",
							status: "skipped",
							processed: 0,
							requestIdempotencyKey: operation.dedupeKey,
							message: "provider does not support rectify",
						} as GdprOperationResult);
					break;
				default:
					result = {
						providerId: params.provider.id,
						action: params.action,
						status: "failed",
						processed: 0,
						requestIdempotencyKey: operation.dedupeKey,
						message: "unsupported action",
					};
					break;
			}
		} catch (error) {
			result = {
				providerId: params.provider.id,
				action: params.action,
				status: "failed",
				processed: 0,
				requestIdempotencyKey: operation.dedupeKey,
				message: error instanceof Error ? error.message : "provider threw",
			};
		}

		operation.status =
			result.status === "success" ? "completed"
				: result.status === "blocked" ? "blocked"
					: result.status === "skipped" ? "skipped"
						: "failed";
		operation.finishedAt = nowIso(this.now);
		operation.errorCode = result.status === "failed" ? "PROVIDER_ERROR" : undefined;
		operation.errorDetails = result.message;
		operation.result = JSON.stringify(result);

		await this.logEvent({
			requestId: params.request.requestId,
			operationId: operation.id,
			providerId: params.provider.id,
			actorId: params.request.requestedBy,
			eventType: operation.status === "completed" ? "operation.completed" : "operation.failed",
			reasonCode: result.status,
			message: result.message ?? "operation finished",
			requestContext: JSON.stringify({ action: params.action, status: result.status }),
		});
		return operation;
	}

	private async persistOperation(operation: GdprOperationRecord): Promise<void> {
		await this.operationStore.upsert(operation);
	}

	private async persistExport(record: GdprExportRecord): Promise<void> {
		await this.exportStore.upsert(record);
	}

	private async logEvent(
		input: {
			requestId?: string;
			operationId?: string;
			providerId?: string;
			actorId?: string;
			eventType: GdprAuditEvent;
			eventSubType?: string;
			reasonCode?: GdprProviderStatus | string;
			message: string;
			requestContext?: string;
		},
	): Promise<void> {
		if (!input.requestId) return;
		const logRow: GdprAuditLogRecord = {
			id: randomUUID(),
			requestId: input.requestId,
			operationId: input.operationId,
			providerId: input.providerId,
			actorId: input.actorId,
			eventType: input.eventType,
			eventSubType: input.eventSubType,
			reasonCode: input.reasonCode,
			message: input.message,
			requestContext: input.requestContext,
			createdAt: nowIso(this.now),
		};
		await this.auditStore.add(logRow);
	}
}
