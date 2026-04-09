import { describe, expect, it } from "vitest";

// generated: do not edit directly

import { COMMERCE_ROUTE_CONTRACTS } from "./route-contracts.js";

const routeEntries = Object.entries(COMMERCE_ROUTE_CONTRACTS).sort(([a], [b]) => a.localeCompare(b));

describe("route contract metadata rules", () => {
	for (const [route, contract] of routeEntries) {
		describe(`route: ${route}`, () => {
			it("must be POST-only", () => {
				expect(contract.method).toBe("POST");
			});

			it("must expose an input schema", () => {
				expect(contract.inputSchema).toBeTruthy();
			});

			it("must keep replay fixture consistency", () => {
				expect(["none", "idempotency_key", "webhook_event"].includes(contract.replay)).toBe(true);
				if (contract.replay === "none") {
					expect(contract.fixtures).toBeUndefined();
				} else {
					expect(contract.fixtures).toBeDefined();
					expect(Array.isArray(contract.fixtures?.valid)).toBe(true);
					expect(Array.isArray(contract.fixtures?.invalid)).toBe(true);
					expect(Array.isArray(contract.fixtures?.replay)).toBe(true);
					expect((contract.fixtures?.valid?.length ?? 0)).toBeGreaterThan(0);
					expect((contract.fixtures?.invalid?.length ?? 0)).toBeGreaterThan(0);
					expect((contract.fixtures?.replay?.length ?? 0)).toBeGreaterThan(0);
				}
			});

			it("must keep side-effect intent coherent", () => {
				if (contract.sideEffectful) {
					expect(Array.isArray(contract.mutationCollections)).toBe(true);
					expect((contract.mutationCollections ?? []).length).toBeGreaterThan(0);
				}
			});

			it("must keep idempotency intent coherent", () => {
				if (contract.requiresIdempotencyKey) {
					expect(contract.replay).toBe("idempotency_key");
					expect(contract.sideEffectful).toBe(true);
				}
			});
		});
	}
});

