import { describe, expect, it } from "vitest";

// generated: do not edit directly

import snapshot from "./route-compliance.generated.json";
import { COMMERCE_ROUTE_CAPABILITIES, COMMERCE_ROUTE_CONTRACTS } from "./route-contracts.js";

type RouteComplianceSnapshot = typeof snapshot;

describe("commerce route contract compliance generated snapshot", () => {
	it("is stable and must be refreshed when contracts change", () => {
		const routeEntries = Object.entries(COMMERCE_ROUTE_CONTRACTS).sort(([a], [b]) => a.localeCompare(b));
		const routeKeys = routeEntries.map(([route]) => route);
		const nonPostRoutes = routeEntries.filter(([, contract]) => contract.method !== "POST").map(([route]) => route);
		expect(nonPostRoutes).toEqual([]);

		const routeRecords = Object.fromEntries(
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
		) as RouteComplianceSnapshot["routeRecords"];

		const replayStrategies: RouteComplianceSnapshot["replayStrategies"] = {};
		for (const route of routeKeys) {
			const strategy = routeRecords[route].replay;
			replayStrategies[strategy] = [...(replayStrategies[strategy] ?? []), route].sort();
		}

		const actual: RouteComplianceSnapshot = {
			routeCount: routeKeys.length,
			routeKeys,
			routeRecords,
			replayStrategies,
			requiresKVRoutes: routeKeys.filter((route) => routeRecords[route].requiresKV).sort(),
			requiresFetchRoutes: routeKeys.filter((route) => routeRecords[route].requiresFetch).sort(),
			sideEffectfulRoutes: routeKeys.filter((route) => routeRecords[route].sideEffectful).sort(),
			requiresIdempotencyKeyRoutes: routeKeys.filter((route) => routeRecords[route].requiresIdempotencyKey).sort(),
		};

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
			const contract = COMMERCE_ROUTE_CONTRACTS[route as keyof typeof COMMERCE_ROUTE_CONTRACTS];
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
			const contract = COMMERCE_ROUTE_CONTRACTS[route as keyof typeof COMMERCE_ROUTE_CONTRACTS];
			expect(contract?.sideEffectful).toBe(true);
			expect((contract?.mutationCollections ?? []).length).toBeGreaterThan(0);
		}

		for (const route of snapshot.requiresIdempotencyKeyRoutes) {
			const contract = COMMERCE_ROUTE_CONTRACTS[route as keyof typeof COMMERCE_ROUTE_CONTRACTS];
			expect(contract?.requiresIdempotencyKey).toBe(true);
			expect(contract?.replay).toBe("idempotency_key");
		}
	});

	it("aligns route capabilities with contract-level fetch requirements", () => {
		const requiresFetchRoutes = [
			...new Set(
				Object.entries(COMMERCE_ROUTE_CONTRACTS)
					.filter(([, contract]) => contract.requiresFetch)
					.map(([routeKey]) => routeKey),
			),
		].sort();
		expect(requiresFetchRoutes).toEqual(snapshot.requiresFetchRoutes);
		for (const route of requiresFetchRoutes) {
			expect(COMMERCE_ROUTE_CAPABILITIES[route as keyof typeof COMMERCE_ROUTE_CAPABILITIES]?.requiresFetch).toBe(true);
		}
	});
});
