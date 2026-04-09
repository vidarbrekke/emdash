import { describe, expect, it } from "vitest";

// generated: do not edit directly

import { COMMERCE_ROUTE_CONTRACTS } from "./route-contracts.js";
import type { CommerceRouteContract } from "./route-contracts.js";
import routeSurface from "./route-contract-surface.generated.json";

const routeEntries = Object.entries(COMMERCE_ROUTE_CONTRACTS) as Array<[string, CommerceRouteContract]>;
routeEntries.sort(([a], [b]) => a.localeCompare(b));
const contractRouteKeys = routeEntries.map(([route]) => route);
const contractRoutePublicMap = Object.fromEntries(
	routeEntries.map(([route, contract]) => [route, { public: contract.public }] as [string, { public: boolean }]),
);
const contractRouteCapabilitiesMap = Object.fromEntries(
	routeEntries.map(
		([route, contract]) =>
			[route, { hasCapabilities: contract.requiresKV || contract.requiresFetch }] as [
				string,
				{ hasCapabilities: boolean },
			],
	),
);
const contractRouteMethodMap = Object.fromEntries(
	routeEntries.map(([route, contract]) => [route, { method: contract.method }] as [string, { method: string }]),
);
const contractRouteMethodMapEntries = Object.entries(contractRouteMethodMap);
type SurfaceRouteRecord = (typeof routeSurface.routeRecords)[keyof typeof routeSurface.routeRecords] & {
	handlerHasRequirePostGuard?: boolean;
};
const surfaceRouteRecords: Record<string, SurfaceRouteRecord> = routeSurface.routeRecords as Record<string, SurfaceRouteRecord>;

describe("route contract to registered route alignment", () => {
	it("must report the same route count from source and contracts", () => {
		expect(routeSurface.routeCount).toBe(contractRouteKeys.length);
	});
	it("must register all and only contract routes", () => {
		expect(routeSurface.routeKeys).toEqual(contractRouteKeys);
	});
	it("must preserve public contract from index registration", () => {
		for (const [route, contract] of Object.entries(contractRoutePublicMap)) {
			expect(surfaceRouteRecords[route]).toMatchObject(contract);
		}
	});
	it("must keep capability wrapper usage aligned with contracts", () => {
		for (const [route, contract] of Object.entries(contractRouteCapabilitiesMap)) {
			expect(surfaceRouteRecords[route]?.hasRouteCapabilitiesWrapper).toBe(contract.hasCapabilities);
		}
	});
	it("must use exactly one route visibility wrapper per route", () => {
		for (const route of contractRouteKeys) {
			const entry = surfaceRouteRecords[route];
			expect(entry).toBeDefined();
			const visibilityWrappers = (entry?.wrappers ?? []).filter((wrapper: string) =>
				["publicRoute", "adminRoute"].includes(wrapper),
			);
			expect(visibilityWrappers).toHaveLength(1);
		}
	});
	it("must not enforce POST in individual handlers", () => {
		for (const route of contractRouteKeys) {
			const entry = surfaceRouteRecords[route];
			expect(entry?.handlerHasRequirePostGuard ?? false).toBe(false);
		}
	});
	it("must never register with unknown handler symbols", () => {
		for (const route of contractRouteKeys) {
			const entry = surfaceRouteRecords[route];
			expect(entry?.routeHandlerName).toEqual(expect.any(String));
		}
	});
	it("must enforce POST method via visibility wrappers", () => {
		for (const [route, contract] of contractRouteMethodMapEntries) {
			if (contract.method === "POST") {
				expect(surfaceRouteRecords[route]?.methodGuarded).toBe(true);
			}
		}
	});
	it("must resolve publicness from known route wrappers", () => {
		expect(routeSurface.unknownPublicRoutes).toEqual([]);
	});
});

