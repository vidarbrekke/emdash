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
	it("must resolve publicness from known route wrappers", () => {
		expect(routeSurface.unknownPublicRoutes).toEqual([]);
	});
});

