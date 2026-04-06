export function up(): void {
	// Placeholder migration.
	// In the final module, this should create:
	// - dc_gdpr_requests
	// - dc_gdpr_operations
	// - dc_gdpr_exports
	// - dc_gdpr_audit_log
	//
	// Keep indexes:
	// - requestId on requests/operations
	// - subjectId on requests
	// - providerId on operations
	// - createdAt/updatedAt on all operational tables
}

export function down(): void {
	// No-op placeholder for v1 rollback behavior.
}
