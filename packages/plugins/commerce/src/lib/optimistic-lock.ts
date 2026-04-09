/**
 * Shared optimistic-lock token helpers.
 *
 * The commerce package uses compare-and-swap for multiple concurrency paths:
 * 1) numeric lock versions for checkout locks
 * 2) timestamp-based claim versions for webhook receipt leases
 *
 * Centralizing validation/bump logic here avoids drift between paths as these
 * protocols evolve.
 */

export const INITIAL_OPTIMISTIC_LOCK_VERSION = "1";

export function parseMonotonicNumericVersion(rawVersion: unknown): string | null {
	if (typeof rawVersion === "number") {
		if (!Number.isFinite(rawVersion) || !Number.isInteger(rawVersion) || rawVersion < 0) {
			return null;
		}
		return String(rawVersion);
	}

	if (typeof rawVersion === "string") {
		const parsed = Number(rawVersion);
		if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
			return null;
		}
		return String(parsed);
	}

	return null;
}

export function bumpMonotonicNumericVersion(rawVersion: string): string {
	const parsed = parseMonotonicNumericVersion(rawVersion);
	if (parsed === null) {
		return INITIAL_OPTIMISTIC_LOCK_VERSION;
	}
	return String(Number(parsed) + 1);
}

export function parseTimestampVersionToken(rawVersion: unknown): string | null {
	if (typeof rawVersion !== "string") return null;
	const parsed = Date.parse(rawVersion);
	return Number.isFinite(parsed) ? rawVersion : null;
}

