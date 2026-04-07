export type GdprDataSubjectKind = "customer" | "user" | "guest" | "account_user" | "contact" | "subscriber" | string;

export type GdprRight =
	| "access"
	| "portability"
	| "erasure"
	| "rectification"
	| "restriction"
	| "objection";

export type GdprRequestStatus =
	| "received"
	| "queued"
	| "running"
	| "partially_completed"
	| "completed"
	| "failed"
	| "denied";

export type GdprProviderStatus = "success" | "skipped" | "not_found" | "retryable" | "blocked" | "failed";

export type GdprOperationAction = "export" | "erase" | "anonymize" | "rectify";

export type GdprOperationStatus = "queued" | "running" | "completed" | "partial" | "failed" | "blocked" | "skipped";

export type GdprAuditEvent = "request.created" | "request.completed" | "request.denied" | "operation.completed" | "operation.failed";

export type GdprProviderSideEffect =
	| "read-core"
	| "write-module"
	| "write-core"
	| "external-io"
	| "analytics"
	| "notification";

export type GdprProviderRiskLevel = "trusted" | "monitored" | "restricted";

export type GdprConsentPurpose = "marketing" | "analytics" | "personalization";

export interface GdprDataSubject {
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	anchor?: {
		orderId?: string;
		cartId?: string;
		emailHash?: string;
	};
}

export interface GdprPersonalDataRecord {
	id: string;
	fields: Record<string, unknown>;
}

export interface GdprPersonalData {
	providerId: string;
	kind: string;
	records: GdprPersonalDataRecord[];
	metadata?: Record<string, unknown>;
}

export interface GdprProviderCapabilities {
	canAccessExport: boolean;
	canErase: boolean;
	canAnonymize: boolean;
	canRectify: boolean;
}

export interface GdprOperationResult {
	providerId: string;
	action: GdprOperationAction;
	status: GdprProviderStatus;
	processed: number;
	requestIdempotencyKey: string;
	message?: string;
	artifacts?: {
		exportId?: string;
		checksum?: string;
		token?: string;
	};
}

export interface GdprProviderManifest {
	providerId: string;
	providerName: string;
	author: string;
	version: string;
	summary: string;
	supportedRights: GdprRight[];
	sideEffects: GdprProviderSideEffect[];
	idempotentByDefault: boolean;
	riskLevel: GdprProviderRiskLevel;
	legalBasisHints?: string[];
	dataSensitivity?: "none" | "low" | "medium" | "high";
	contactEmail?: string;
}

export interface GdprPersonalDataProvider {
	id: string;
	name: string;
	capabilities(): Promise<GdprProviderCapabilities>;
	discoverSubjects(input: { subjectId?: string; orderId?: string }): Promise<GdprDataSubject[]>;
	exportData(subject: GdprDataSubject, opts: { dryRun?: boolean }): Promise<GdprPersonalData>;
	anonymizeData(
		subject: GdprDataSubject,
		opts: { dryRun?: boolean; legalHoldOk?: boolean },
	): Promise<GdprOperationResult>;
	eraseData(
		subject: GdprDataSubject,
		opts: { dryRun?: boolean; legalHoldOk?: boolean },
	): Promise<GdprOperationResult>;
	rectifyData?(subject: GdprDataSubject, patch: Record<string, unknown>): Promise<GdprOperationResult>;
}

export interface GdprThirdPartyProviderBundle {
	provider: GdprPersonalDataProvider;
	manifest: GdprProviderManifest;
}

export interface GdprRequestRecord {
	id: string;
	requestId: string;
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	right: GdprRight;
	status: GdprRequestStatus;
	scope?: string;
	requestedBy: string;
	validationSummary?: string;
	resultSummary?: string;
	errorCode?: string;
	requestHash: string;
	createdAt: string;
	updatedAt: string;
	startedAt?: string;
	completedAt?: string;
	idempotencyKey: string;
}

export interface GdprOperationRecord {
	id: string;
	requestId: string;
	providerId: string;
	action: GdprOperationAction;
	status: GdprOperationStatus;
	attempt: number;
	dedupeKey: string;
	startedAt?: string;
	finishedAt?: string;
	errorCode?: string;
	errorDetails?: string;
	result?: string;
}

export interface GdprExportRecord {
	id: string;
	requestId: string;
	providerId: string;
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	payloadLocation?: string;
	payloadVersion?: string;
	sha256?: string;
	sizeBytes?: number;
	expiresAt?: string;
	createdAt: string;
}

export interface GdprAuditLogRecord {
	id: string;
	requestId?: string;
	operationId?: string;
	providerId?: string;
	actorId?: string;
	eventType: GdprAuditEvent;
	eventSubType?: string;
	reasonCode?: string;
	message: string;
	requestContext?: string;
	createdAt: string;
}

export interface GdprConsentRecord {
	id: string;
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	purpose: GdprConsentPurpose;
	granted: boolean;
	updatedAt: string;
}

export interface GdprLegalHoldRecord {
	id: string;
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	reasonCode: string;
	reasonDetails: string;
	expiresAt?: string;
	createdAt: string;
}
