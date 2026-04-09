import { describe, expect, it } from "vitest";

// generated: do not edit directly

import { COMMERCE_ROUTE_CONTRACTS } from "./route-contracts.js";
import routeSurface from "./route-contract-surface.generated.json";

const routeEntries = Object.entries(COMMERCE_ROUTE_CONTRACTS).sort(([a], [b]) => a.localeCompare(b));
const contractRouteKeys = routeEntries.map(([route]) => route);
const contractRoutePublicMap = Object.fromEntries(
	routeEntries.map(([route, contract]) => [route, { public: contract.public }]),
);
const contractRouteCapabilitiesMap = Object.fromEntries(
	routeEntries.map(([route, contract]) => [route, { hasCapabilities: contract.requiresKV || contract.requiresFetch }]),
);
const contractRouteSideEffectMap = Object.fromEntries(
	routeEntries.map(([route, contract]) => [route, { sideEffectful: contract.sideEffectful }]),
);

describe("route contract to registered route alignment", () => {
	it("must report the same route count from source and contracts", () => {
		expect(routeSurface.routeCount).toBe(contractRouteKeys.length);
	});
	it("must register all and only contract routes", () => {
		expect(routeSurface.routeKeys).toEqual(contractRouteKeys);
	});
	it("must preserve public contract from index registration", () => {
		for (const [route, contract] of Object.entries(contractRoutePublicMap)) {
			expect(routeSurface.routeRecords[route]).toMatchObject(contract);
		}
	});
	it("must keep capability wrapper usage aligned with contracts", () => {
		for (const [route, contract] of Object.entries(contractRouteCapabilitiesMap)) {
			expect(routeSurface.routeRecords[route]?.hasRouteCapabilitiesWrapper).toBe(contract.hasCapabilities);
		}
	});
	it("must use exactly one route visibility wrapper per route", () => {
		for (const route of contractRouteKeys) {
			const entry = routeSurface.routeRecords[route];
			expect(entry).toBeDefined();
			const visibilityWrappers = (entry?.wrappers ?? []).filter((wrapper) =>
				["publicRoute", "adminRoute"].includes(wrapper),
			);
			expect(visibilityWrappers).toHaveLength(1);
		}
	});
	it("must never register with unknown handler symbols", () => {
		for (const route of contractRouteKeys) {
			const entry = routeSurface.routeRecords[route];
			expect(entry?.routeHandlerName).toEqual(expect.any(String));
		}
	});
	it("must apply requirePost guards for side-effecting contract routes", () => {
		for (const [route, contract] of Object.entries(contractRouteSideEffectMap)) {
			if (contract.sideEffectful) {
				expect(routeSurface.routeRecords[route]?.handlerHasRequirePostGuard).toBe(true);
			}
		}
	});
	it("must resolve publicness from known route wrappers", () => {
		expect(routeSurface.unknownPublicRoutes).toEqual([]);
	});
});

