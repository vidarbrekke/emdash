import { describe, expect, it } from "vitest";

// generated: do not edit directly
/* eslint-disable unicorn/no-array-sort, e18e/prefer-array-to-sorted */

import snapshot from "./route-compliance.generated.json";
import { COMMERCE_ROUTE_CAPABILITIES, COMMERCE_ROUTE_CONTRACTS } from "./route-contracts.js";
import type { CommerceRouteContract } from "./route-contracts.js";

type RouteComplianceSnapshot = typeof snapshot;
type ContractEntries = Array<[string, CommerceRouteContract]>;
type RouteRecord = {
	method: string;
	replay: string;
	requiresKV: boolean;
	requiresFetch: boolean;
	sideEffectful: boolean;
	requiresIdempotencyKey: boolean;
	mutationCollections: string[];
	hasFixtures: boolean;
};

describe("commerce route contract compliance generated snapshot", () => {
	it("is stable and must be refreshed when contracts change", () => {
		const routeEntries = Object.entries(COMMERCE_ROUTE_CONTRACTS).sort((left, right) =>
			left[0].localeCompare(right[0]),
		) as ContractEntries;
		const routeKeys = routeEntries.map(([route]) => route);
		const nonPostRoutes = routeEntries.filter(([, contract]) => contract.method !== "POST").map(([route]) => route);
		expect(nonPostRoutes).toEqual([]);

		const routeRecords: Record<string, RouteRecord> = Object.fromEntries(
			routeEntries.map(([route, contract]) => [
				route,
				{
					method: contract.method,
					replay: contract.replay,
					requiresKV: !!contract.requiresKV,
					requiresFetch: !!contract.requiresFetch,
					sideEffectful: !!contract.sideEffectful,
					requiresIdempotencyKey: !!contract.requiresIdempotencyKey,
					mutationCollections: [...(contract.mutationCollections ?? [])].sort(),
					hasFixtures: contract.fixtures !== undefined,
				},
			]),
		);

		const replayStrategies: Record<string, string[]> = {};
		for (const route of routeKeys) {
			const strategy = routeRecords[route]!.replay;
			replayStrategies[strategy] = [...(replayStrategies[strategy] ?? []), route].sort();
		}

		const hasKVRoutes = routeKeys.filter((route) => routeRecords[route]!.requiresKV).sort();
		const hasFetchRoutes = routeKeys.filter((route) => routeRecords[route]!.requiresFetch).sort();
		const sideEffectfulRoutes = routeKeys.filter((route) => routeRecords[route]!.sideEffectful).sort();
		const requiresIdempotencyKeyRoutes = routeKeys
			.filter((route) => routeRecords[route]!.requiresIdempotencyKey)
			.sort();

		const actual = {
			routeCount: routeKeys.length,
			routeKeys,
			routeRecords,
			replayStrategies,
			requiresKVRoutes: hasKVRoutes,
			requiresFetchRoutes: hasFetchRoutes,
			sideEffectfulRoutes,
			requiresIdempotencyKeyRoutes,
		} as RouteComplianceSnapshot;

		const expected = snapshot as RouteComplianceSnapshot;
		expect(actual).toEqual(expected);
	});

	it("keeps replay-sensitive routes paired with replay fixtures", () => {
		const replayRoutes = Object.entries(COMMERCE_ROUTE_CONTRACTS)
			.filter(([, contract]) => contract.replay !== "none")
			.map(([route]) => route)
			.sort();
		expect(replayRoutes).toEqual(
			Object.entries(snapshot.routeRecords)
				.filter(([, record]) => record.replay !== "none")
				.map(([route]) => route)
				.sort(),
		);

		for (const route of replayRoutes) {
			const contract = COMMERCE_ROUTE_CONTRACTS[route as keyof typeof COMMERCE_ROUTE_CONTRACTS] as CommerceRouteContract;
			expect(contract?.fixtures).toEqual(expect.anything());
			expect(contract?.fixtures?.valid).toEqual(expect.any(Array));
			expect(contract?.fixtures?.invalid).toEqual(expect.any(Array));
			expect(contract?.fixtures?.replay).toEqual(expect.any(Array));
			expect(contract?.fixtures?.valid?.length).toBeGreaterThan(0);
			expect(contract?.fixtures?.invalid?.length).toBeGreaterThan(0);
			expect(contract?.fixtures?.replay?.length).toBeGreaterThan(0);
		}
	});

	it("keeps side-effect contracts and idempotency intent coherent", () => {
		for (const route of snapshot.sideEffectfulRoutes) {
			const contract = COMMERCE_ROUTE_CONTRACTS[route as keyof typeof COMMERCE_ROUTE_CONTRACTS] as CommerceRouteContract;
			expect(contract?.sideEffectful).toBe(true);
			expect((contract?.mutationCollections ?? []).length).toBeGreaterThan(0);
		}

		for (const route of snapshot.requiresIdempotencyKeyRoutes) {
			const contract = COMMERCE_ROUTE_CONTRACTS[route as keyof typeof COMMERCE_ROUTE_CONTRACTS] as CommerceRouteContract;
			expect(contract?.requiresIdempotencyKey).toBe(true);
			expect(contract?.replay).toBe("idempotency_key");
		}
	});

	it("aligns route capabilities with contract-level fetch requirements", () => {
		const requiresFetchRoutes = [...new Set(
			Object.entries(COMMERCE_ROUTE_CONTRACTS)
				.filter(([, contract]) => contract.requiresFetch)
				.map(([routeKey]) => routeKey),
		)].sort();
		expect(requiresFetchRoutes).toEqual(snapshot.requiresFetchRoutes);
		for (const route of requiresFetchRoutes) {
			expect(COMMERCE_ROUTE_CAPABILITIES[route as keyof typeof COMMERCE_ROUTE_CAPABILITIES]?.requiresFetch).toBe(true);
		}
	});
});
