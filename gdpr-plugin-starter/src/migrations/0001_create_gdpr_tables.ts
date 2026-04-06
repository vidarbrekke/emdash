import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
	await db.schema
		.createTable("dc_gdpr_requests")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("request_id", "text", (col) => col.notNull().unique())
		.addColumn("subject_id", "text", (col) => col.notNull())
		.addColumn("subject_kind", "text", (col) => col.notNull())
		.addColumn("right_type", "text", (col) => col.notNull())
		.addColumn("status", "text", (col) => col.notNull())
		.addColumn("request_scope", "text")
		.addColumn("requested_by", "text")
		.addColumn("error_code", "text")
		.addColumn("result_summary", "text")
		.addColumn("created_at", "text")
		.addColumn("updated_at", "text")
		.addColumn("started_at", "text")
		.addColumn("completed_at", "text")
		.addColumn("request_json", "text")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_requests_subject_id")
		.ifNotExists()
		.on("dc_gdpr_requests")
		.column("subject_id")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_requests_status")
		.ifNotExists()
		.on("dc_gdpr_requests")
		.column("status")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_requests_request_id")
		.ifNotExists()
		.on("dc_gdpr_requests")
		.column("request_id")
		.execute();

	await db.schema
		.createTable("dc_gdpr_operations")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("request_id", "text", (col) => col.notNull())
		.addColumn("provider_id", "text", (col) => col.notNull())
		.addColumn("action", "text", (col) => col.notNull())
		.addColumn("status", "text", (col) => col.notNull())
		.addColumn("processed", "integer", (col) => col.notNull().defaultTo(0))
		.addColumn("request_idempotency_key", "text")
		.addColumn("message", "text")
		.addColumn("created_at", "text")
		.addColumn("updated_at", "text")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_operations_request_id")
		.ifNotExists()
		.on("dc_gdpr_operations")
		.column("request_id")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_operations_provider_id")
		.ifNotExists()
		.on("dc_gdpr_operations")
		.column("provider_id")
		.execute();

	await db.schema
		.createTable("dc_gdpr_exports")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("request_id", "text", (col) => col.notNull().unique())
		.addColumn("export_id", "text", (col) => col.notNull().unique())
		.addColumn("subject_id", "text", (col) => col.notNull())
		.addColumn("subject_kind", "text", (col) => col.notNull())
		.addColumn("status", "text", (col) => col.notNull())
		.addColumn("export_path", "text")
		.addColumn("created_by", "text")
		.addColumn("created_at", "text")
		.addColumn("updated_at", "text")
		.addColumn("expires_at", "text")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_exports_subject_id")
		.ifNotExists()
		.on("dc_gdpr_exports")
		.column("subject_id")
		.execute();

	await db.schema
		.createTable("dc_gdpr_audit_log")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("request_id", "text")
		.addColumn("provider_id", "text")
		.addColumn("actor_kind", "text")
		.addColumn("actor_id", "text")
		.addColumn("action", "text", (col) => col.notNull())
		.addColumn("outcome", "text")
		.addColumn("metadata", "text")
		.addColumn("created_at", "text")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_audit_request_id")
		.ifNotExists()
		.on("dc_gdpr_audit_log")
		.column("request_id")
		.execute();

	await db.schema
		.createTable("dc_gdpr_consents")
		.ifNotExists()
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("subject_id", "text", (col) => col.notNull())
		.addColumn("subject_kind", "text", (col) => col.notNull())
		.addColumn("has_consent", "integer", (col) => col.notNull().defaultTo(0))
		.addColumn("granted_for", "text")
		.addColumn("marketing_enabled", "integer", (col) => col.defaultTo(0))
		.addColumn("analytics_enabled", "integer", (col) => col.defaultTo(0))
		.addColumn("legal_basis", "text")
		.addColumn("revoked_at", "text")
		.addColumn("updated_at", "text")
		.addColumn("created_at", "text")
		.execute();

	await db.schema
		.createIndex("idx_dc_gdpr_consents_subject_id")
		.ifNotExists()
		.on("dc_gdpr_consents")
		.column("subject_id")
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	await db.schema.dropTable("dc_gdpr_consents").execute();
	await db.schema.dropTable("dc_gdpr_audit_log").execute();
	await db.schema.dropTable("dc_gdpr_exports").execute();
	await db.schema.dropTable("dc_gdpr_operations").execute();
	await db.schema.dropTable("dc_gdpr_requests").execute();
}
