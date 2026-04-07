export interface GdprMigrationExecutor {
	execute(sql: string): Promise<unknown>;
}

export async function up(db: GdprMigrationExecutor): Promise<void> {
	await db.execute(`
		CREATE TABLE IF NOT EXISTS dc_gdpr_requests (
			id TEXT PRIMARY KEY,
			request_id TEXT NOT NULL UNIQUE,
			subject_id TEXT NOT NULL,
			subject_kind TEXT NOT NULL,
			right_type TEXT NOT NULL,
			status TEXT NOT NULL,
			request_scope TEXT,
			requested_by TEXT,
			validation_summary TEXT,
			result_summary TEXT,
			error_code TEXT,
			request_hash TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			started_at TEXT,
			completed_at TEXT,
			idempotency_key TEXT NOT NULL
		);
	`);
	await db.execute(
		"CREATE INDEX IF NOT EXISTS idx_dc_gdpr_requests_subject_id ON dc_gdpr_requests (subject_id);",
	);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_requests_status ON dc_gdpr_requests (status);",);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_requests_idempotency_key ON dc_gdpr_requests (idempotency_key);",);

	await db.execute(`
		CREATE TABLE IF NOT EXISTS dc_gdpr_operations (
			id TEXT PRIMARY KEY,
			request_id TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			action TEXT NOT NULL,
			status TEXT NOT NULL,
			attempt INTEGER NOT NULL DEFAULT 1,
			dedupe_key TEXT NOT NULL UNIQUE,
			started_at TEXT,
			finished_at TEXT,
			error_code TEXT,
			error_details TEXT,
			result TEXT
		);
	`);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_operations_request_id ON dc_gdpr_operations (request_id);",);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_operations_provider_id ON dc_gdpr_operations (provider_id);",);

	await db.execute(`
		CREATE TABLE IF NOT EXISTS dc_gdpr_exports (
			id TEXT PRIMARY KEY,
			request_id TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			subject_id TEXT NOT NULL,
			subject_kind TEXT NOT NULL,
			payload_location TEXT,
			payload_version TEXT,
			sha256 TEXT,
			size_bytes INTEGER,
			expires_at TEXT,
			created_at TEXT NOT NULL
		);
	`);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_exports_request_id ON dc_gdpr_exports (request_id);",);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_exports_subject_id ON dc_gdpr_exports (subject_id);",);

	await db.execute(`
		CREATE TABLE IF NOT EXISTS dc_gdpr_audit_log (
			id TEXT PRIMARY KEY,
			request_id TEXT,
			operation_id TEXT,
			provider_id TEXT,
			actor_id TEXT,
			event_type TEXT NOT NULL,
			event_sub_type TEXT,
			reason_code TEXT,
			message TEXT NOT NULL,
			request_context TEXT,
			created_at TEXT NOT NULL
		);
	`);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_audit_log_request_id ON dc_gdpr_audit_log (request_id);",);

	await db.execute(`
		CREATE TABLE IF NOT EXISTS dc_gdpr_consents (
			id TEXT PRIMARY KEY,
			subject_id TEXT NOT NULL,
			subject_kind TEXT NOT NULL,
			purpose TEXT NOT NULL,
			granted INTEGER NOT NULL,
			updated_at TEXT NOT NULL
		);
	`);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_consents_subject_id ON dc_gdpr_consents (subject_id);",);

	await db.execute(`
		CREATE TABLE IF NOT EXISTS dc_gdpr_subject_index (
			id TEXT PRIMARY KEY,
			subject_id TEXT NOT NULL,
			subject_kind TEXT NOT NULL,
			last_seen_at TEXT NOT NULL
		);
	`);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_subject_index_subject_id ON dc_gdpr_subject_index (subject_id);",);

	await db.execute(`
		CREATE TABLE IF NOT EXISTS dc_gdpr_legal_holds (
			id TEXT PRIMARY KEY,
			subject_id TEXT NOT NULL,
			subject_kind TEXT NOT NULL,
			reason_code TEXT NOT NULL,
			reason_details TEXT NOT NULL,
			expires_at TEXT,
			created_at TEXT NOT NULL
		);
	`);
	await db.execute("CREATE INDEX IF NOT EXISTS idx_dc_gdpr_legal_holds_subject_id ON dc_gdpr_legal_holds (subject_id);",);
}

export async function down(db: GdprMigrationExecutor): Promise<void> {
	await db.execute("DROP TABLE IF EXISTS dc_gdpr_legal_holds;");
	await db.execute("DROP TABLE IF EXISTS dc_gdpr_subject_index;");
	await db.execute("DROP TABLE IF EXISTS dc_gdpr_consents;");
	await db.execute("DROP TABLE IF EXISTS dc_gdpr_audit_log;");
	await db.execute("DROP TABLE IF EXISTS dc_gdpr_exports;");
	await db.execute("DROP TABLE IF EXISTS dc_gdpr_operations;");
	await db.execute("DROP TABLE IF EXISTS dc_gdpr_requests;");
}
