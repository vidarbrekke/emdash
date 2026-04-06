export type GdprDataSubjectKind = "customer" | "user" | "contact" | "guest" | "subscriber" | "account_user" | string;

export type GdprRight =
	| "access"
	| "portability"
	| "erasure"
	| "rectification"
	| "restriction"
	| "objection";

export type GdprRequestStatus =
	| "pending"
	| "validated"
	| "queued"
	| "running"
	| "partially_completed"
	| "completed"
	| "failed"
	| "denied";

export type GdprProviderStatus =
	| "success"
	| "skipped"
	| "not_found"
	| "retryable"
	| "blocked"
	| "failed";

export type GdprOperationAction = "export" | "erase" | "anonymize" | "rectify";

export type GdprProviderSideEffect = "read-core" | "write-module" | "write-core" | "external-io" | "analytics" | "notification";

export type GdprProviderRiskLevel = "trusted" | "monitored" | "restricted";

export type GdprProviderManifest = {
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
};

export type GdprLegalHold = {
	reasonCode: string;
	reasonDetails: string;
	expiresAt?: string;
};

export type GdprDataSubject = {
	subjectId: string;
	subjectKind: GdprDataSubjectKind;
	anchor?: {
		orderId?: string;
		cartId?: string;
		emailHash?: string;
	};
};

export type GdprPersonalDataRecord = {
	id: string;
	fields: Record<string, unknown>;
};

export type GdprPersonalData = {
	providerId: string;
	kind: string;
	records: GdprPersonalDataRecord[];
	metadata?: Record<string, unknown>;
};

export type GdprProviderCapabilities = {
	canAccessExport: boolean;
	canErase: boolean;
	canAnonymize: boolean;
	canRectify: boolean;
	retentionOverrides?: GdprLegalHold[];
};

export type GdprOperationResult = {
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
};

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
