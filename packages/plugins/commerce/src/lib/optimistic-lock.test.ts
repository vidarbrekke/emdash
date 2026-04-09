import { describe, expect, it } from "vitest";

import { INITIAL_OPTIMISTIC_LOCK_VERSION, bumpMonotonicNumericVersion, parseMonotonicNumericVersion, parseTimestampVersionToken } from "./optimistic-lock.js";

describe("optimistic lock version tokens", () => {
	it("parses and bumps monotonic numeric versions", () => {
		expect(parseMonotonicNumericVersion(1)).toBe("1");
		expect(parseMonotonicNumericVersion(1.2)).toBeNull();
		expect(parseMonotonicNumericVersion("2")).toBe("2");
		expect(parseMonotonicNumericVersion("2.9")).toBeNull();
		expect(parseMonotonicNumericVersion("not-a-number")).toBeNull();

		expect(bumpMonotonicNumericVersion("1")).toBe("2");
		expect(bumpMonotonicNumericVersion(parseMonotonicNumericVersion("3")!)).toBe("4");
		expect(bumpMonotonicNumericVersion("bad")).toBe(INITIAL_OPTIMISTIC_LOCK_VERSION);
	});

	it("validates timestamp claim versions", () => {
		const now = new Date().toISOString();
		expect(parseTimestampVersionToken(now)).toBe(now);
		expect(parseTimestampVersionToken("not-a-timestamp")).toBeNull();
		expect(parseTimestampVersionToken(undefined)).toBeNull();
	});
});

