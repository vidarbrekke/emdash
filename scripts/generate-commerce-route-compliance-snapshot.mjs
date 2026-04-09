#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = resolve(
	REPO_ROOT,
	"packages/plugins/commerce/src/contracts/route-compliance.generated.json",
);
const TEST_OUTPUT_PATH = resolve(
	REPO_ROOT,
	"packages/plugins/commerce/src/contracts/route-compliance-generated.test.ts",
);
const RULE_TEST_OUTPUT_PATH = resolve(
	REPO_ROOT,
	"packages/plugins/commerce/src/contracts/route-contract-rules.generated.test.ts",
);
const SURFACE_TEST_OUTPUT_PATH = resolve(
	REPO_ROOT,
	"packages/plugins/commerce/src/contracts/route-contract-surface.generated.test.ts",
);
const SURFACE_OUTPUT_PATH = resolve(
	REPO_ROOT,
	"packages/plugins/commerce/src/contracts/route-contract-surface.generated.json",
);
const CHECK_MODE = process.argv.includes("--check");

const CONTRACT_SOURCE_PATH = resolve(
	REPO_ROOT,
	"packages/plugins/commerce/src/contracts/route-contracts.ts",
);
const PLUGIN_INDEX_PATH = resolve(REPO_ROOT, "packages/plugins/commerce/src/index.ts");
const contractSourceText = readFileSync(CONTRACT_SOURCE_PATH, "utf8");
const pluginIndexSourceText = readFileSync(PLUGIN_INDEX_PATH, "utf8");
const contractSource = ts.createSourceFile(CONTRACT_SOURCE_PATH, contractSourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const pluginIndexSource = ts.createSourceFile(PLUGIN_INDEX_PATH, pluginIndexSourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const SUPPORTED_ROUTE_DEFINITION_WRAPPERS = new Set(["publicRoute", "adminRoute", "withRouteCapabilities"]);
const ROUTE_HANDLER_WRAPPERS = new Set(["publicRoute", "adminRoute", "withRouteCapabilities"]);

function unwrapExpression(node) {
	while (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isTypeAssertionExpression(node) ||
		ts.isSatisfiesExpression(node)
	) {
		node = node.expression;
	}
	return node;
}

function getObjectLiteral(node) {
	const unwrapped = unwrapExpression(node);
	return ts.isObjectLiteralExpression(unwrapped) ? unwrapped : null;
}

function getPropertyNameText(name) {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
		return name.text;
	}
	return undefined;
}

function getPropertyValue(node, name) {
	const identifierMatch = node.properties.find(
		(item) =>
			ts.isPropertyAssignment(item) &&
			ts.isIdentifier(item.name) &&
			item.name.text === name,
	);
	const stringMatch = node.properties.find(
		(item) =>
			ts.isPropertyAssignment(item) &&
			ts.isStringLiteral(item.name) &&
			item.name.text === name,
	);
	const propertyMatch = stringMatch ?? identifierMatch;
	if (!propertyMatch || !ts.isPropertyAssignment(propertyMatch)) return undefined;
	return propertyMatch.initializer;
}

function getPropertyByName(node, name) {
	return node.properties.find((item) =>
		ts.isPropertyAssignment(item) &&
		getPropertyNameText(item.name) === name,
	);
}

function getCalleeName(expression) {
	if (ts.isIdentifier(expression)) return expression.text;
	if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
	return undefined;
}

function walk(node, visit) {
	ts.forEachChild(node, visit);
}

function deriveRoutePublicness(node, unsupportedWrappers = new Set()) {
	const expression = unwrapExpression(node);
	if (ts.isObjectLiteralExpression(expression)) {
		const property = getPropertyValue(expression, "public");
		const publicValue = literalBoolean(property);
		if (publicValue !== undefined) return publicValue;
		return undefined;
	}

	if (!ts.isCallExpression(expression)) return undefined;
	const callee = getCalleeName(expression.expression);
	if (callee === "publicRoute") return true;
	if (callee === "adminRoute") return false;
	if (callee && !SUPPORTED_ROUTE_DEFINITION_WRAPPERS.has(callee)) {
		unsupportedWrappers.add(callee);
	}

	for (const argument of expression.arguments) {
		const publicness = deriveRoutePublicness(argument, unsupportedWrappers);
		if (publicness !== undefined) return publicness;
	}
	return undefined;
}

function hasRequirePostCall(node) {
	let found = false;
	const visit = (candidate) => {
		if (found) return;
		if (!candidate) return;
		if (ts.isCallExpression(candidate) && getCalleeName(candidate.expression) === "requirePost") {
			found = true;
			return;
		}
		ts.forEachChild(candidate, visit);
	};
	visit(node);
	return found;
}

function hasHandlerRequirePostGuard(handlerName) {
	const sourcePath = ROUTE_HANDLER_IMPORTS[handlerName];
	if (!sourcePath) return undefined;
	let sourceText;
	try {
		sourceText = readFileSync(sourcePath, "utf8");
	} catch {
		return undefined;
	}

	const handlerSource = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
	let handlerDeclaration = null;
	for (const statement of handlerSource.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name?.text === handlerName) {
			handlerDeclaration = statement;
			break;
		}

		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || declaration.name.text !== handlerName) continue;
			const initializer = declaration.initializer;
			if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
				handlerDeclaration = initializer;
				break;
			}
		}
	}
	if (!handlerDeclaration) return undefined;
	if (!ts.isFunctionLike(handlerDeclaration)) return undefined;
	if (!handlerDeclaration.body) return undefined;
	return hasRequirePostCall(handlerDeclaration.body);
}

function collectRouteWrappers(node, wrappers = new Set()) {
	const expression = unwrapExpression(node);
	if (ts.isCallExpression(expression)) {
		const callee = getCalleeName(expression.expression);
		if (callee) wrappers.add(callee);
		for (const argument of expression.arguments) {
			collectRouteWrappers(argument, wrappers);
		}
		return wrappers;
	}

	if (ts.isObjectLiteralExpression(expression)) {
		for (const property of expression.properties) {
			if (!ts.isPropertyAssignment(property)) continue;
			collectRouteWrappers(property.initializer, wrappers);
		}
		return wrappers;
	}

	return wrappers;
}

function resolveHandlerSourcePath(rawModuleSpecifier) {
	const resolved = resolve(dirname(PLUGIN_INDEX_PATH), rawModuleSpecifier);
	if (resolved.endsWith(".ts")) return resolved;
	if (resolved.endsWith(".js")) return `${resolved.slice(0, -3)}.ts`;
	return `${resolved}.ts`;
}

function collectRouteHandlerImports() {
	const imports = {};
	for (const statement of pluginIndexSource.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		const moduleSpecifier = statement.moduleSpecifier;
		if (!ts.isStringLiteral(moduleSpecifier)) continue;
		const rawModule = moduleSpecifier.text;
		if (!rawModule.startsWith("./handlers/")) continue;
		if (!statement.importClause) continue;
		const named = statement.importClause.namedBindings;
		if (!named || !ts.isNamedImports(named)) continue;
		const sourcePath = resolveHandlerSourcePath(rawModule);
		for (const element of named.elements) {
			const localName = element.name.text;
			imports[localName] = sourcePath;
		}
	}
	return imports;
}

const ROUTE_HANDLER_IMPORTS = collectRouteHandlerImports();

function deriveRouteHandlerNode(node) {
	const expression = unwrapExpression(node);
	if (ts.isCallExpression(expression)) {
		const callee = getCalleeName(expression.expression);
		const handlerCandidate = callee && ROUTE_HANDLER_WRAPPERS.has(callee) ? expression.arguments[1] : undefined;
		if (handlerCandidate) {
			const handler = deriveRouteHandlerNode(handlerCandidate);
			if (handler) return handler;
		}

		for (const argument of expression.arguments) {
			const nested = deriveRouteHandlerNode(argument);
			if (nested) return nested;
		}
		return undefined;
	}

	if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) return expression;
	return undefined;
}

function handlerNameFromNode(node) {
	if (ts.isIdentifier(node)) return node.text;
	return undefined;
}

function findPluginRoutesObject() {
	let routeObject = null;

	function visit(node) {
		if (routeObject) return;
		if (ts.isCallExpression(node)) {
			const calleeName = getCalleeName(node.expression);
			if (calleeName === "createCommercePlugin") {
				if (node.arguments.length === 0) return;
				const configObject = getObjectLiteral(node.arguments[0]);
				if (!configObject) return;
				const routesProperty = getPropertyByName(configObject, "routes");
				if (!routesProperty || !ts.isPropertyAssignment(routesProperty)) return;
				const routesValue = getObjectLiteral(routesProperty.initializer);
				if (routesValue) {
					routeObject = routesValue;
				}
			}
		}
		walk(node, visit);
	}

	walk(pluginIndexSource, visit);
	return routeObject;
}

function literalString(node) {
	if (!node) return undefined;
	if (ts.isIdentifier(node)) return node.text;
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return node.text;
	}
	return undefined;
}

function literalBoolean(node) {
	if (!node) return undefined;
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	return undefined;
}

function literalStringArray(node) {
	const arrayNode = unwrapExpression(node);
	if (!ts.isArrayLiteralExpression(arrayNode)) return undefined;
	const values = [];
	for (const item of arrayNode.elements) {
		const value = literalString(item);
		if (typeof value === "string") values.push(value);
	}
	return values.length > 0 ? values : [];
}

function snapshotRoutes() {
	let routeContractsLiteral = null;

	for (const statement of contractSource.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (!declaration.name || declaration.name.getText(contractSource) !== "COMMERCE_ROUTE_CONTRACTS") continue;
			if (!declaration.initializer) continue;
			routeContractsLiteral = getObjectLiteral(declaration.initializer);
		}
	}

	if (!routeContractsLiteral) {
		throw new Error("Could not locate COMMERCE_ROUTE_CONTRACTS object literal.");
	}

	const routeRecords = {};
	for (const entry of routeContractsLiteral.properties) {
		if (!ts.isPropertyAssignment(entry)) continue;
		const route = literalString(entry.name);
		if (typeof route !== "string") continue;

		const contract = getObjectLiteral(entry.initializer);
		if (!contract) continue;

		const method = literalString(getPropertyValue(contract, "method")) ?? "POST";
		const replay = literalString(getPropertyValue(contract, "replay")) ?? "none";
		const requiresKV = Boolean(literalBoolean(getPropertyValue(contract, "requiresKV")));
		const requiresFetch = Boolean(literalBoolean(getPropertyValue(contract, "requiresFetch")));
		const sideEffectful = Boolean(literalBoolean(getPropertyValue(contract, "sideEffectful")));
		const requiresIdempotencyKey = Boolean(literalBoolean(getPropertyValue(contract, "requiresIdempotencyKey")));
		const mutationCollections = literalStringArray(
			getPropertyValue(contract, "mutationCollections") ?? ts.factory.createArrayLiteralExpression(),
		);
		const hasFixtures = Boolean(
			getPropertyByName(contract, "fixtures") !== undefined,
		);

		routeRecords[route] = {
			method,
			replay,
			requiresKV,
			requiresFetch,
			sideEffectful,
			requiresIdempotencyKey,
			mutationCollections: (mutationCollections ?? []).sort(),
			hasFixtures,
		};
	}

	const routeKeys = Object.keys(routeRecords).sort();
	const sortedRouteRecords = Object.fromEntries(
		routeKeys.map((route) => [route, routeRecords[route]]),
	);
	const replayGroups = {};
	for (const route of routeKeys) {
		const strategy = routeRecords[route].replay;
		replayGroups[strategy] = replayGroups[strategy] ?? [];
		replayGroups[strategy].push(route);
	}
	for (const strategy of Object.keys(replayGroups)) {
		replayGroups[strategy].sort();
	}

	return {
		routeCount: routeKeys.length,
		routeKeys,
		routeRecords: sortedRouteRecords,
		replayStrategies: replayGroups,
		requiresKVRoutes: routeKeys.filter((route) => routeRecords[route].requiresKV).sort(),
		requiresFetchRoutes: routeKeys.filter((route) => routeRecords[route].requiresFetch).sort(),
		sideEffectfulRoutes: routeKeys.filter((route) => routeRecords[route].sideEffectful).sort(),
		requiresIdempotencyKeyRoutes: routeKeys.filter((route) => routeRecords[route].requiresIdempotencyKey).sort(),
	};
}

function snapshotRouteSurfaceRoutes(routeContractRecords = {}) {
	const routeObject = findPluginRoutesObject();
	if (!routeObject) {
		throw new Error("Could not locate plugin routes object literal.");
	}

	const routeRecords = {};
	const unknownPublicRoutes = [];
	const unsupportedRouteWrappers = {};
	const unknownHandlerRoutes = [];

	for (const entry of routeObject.properties) {
		if (!ts.isPropertyAssignment(entry)) continue;
		const route = literalString(entry.name);
		if (typeof route !== "string") continue;

		const routeUnsupportedWrappers = new Set();
		const publicness = deriveRoutePublicness(entry.initializer, routeUnsupportedWrappers);
		const routeWrappers = [...collectRouteWrappers(entry.initializer)].sort();
		const routeHandlerNode = deriveRouteHandlerNode(entry.initializer);
		const routeHandlerName = handlerNameFromNode(routeHandlerNode);
		if (!routeHandlerName) {
			unknownHandlerRoutes.push(route);
		}
		const handlerHasRequirePostGuard = routeHandlerName ? hasHandlerRequirePostGuard(routeHandlerName) : undefined;
		if (routeUnsupportedWrappers.size > 0) {
			unsupportedRouteWrappers[route] = [...routeUnsupportedWrappers].sort();
		}
		if (publicness === undefined) {
			unknownPublicRoutes.push(route);
		}
		const contractMetadata = routeContractRecords[route] ?? {};
		routeRecords[route] = {
			public: publicness ?? false,
			wrappers: routeWrappers,
			hasRouteCapabilitiesWrapper: routeWrappers.includes("withRouteCapabilities"),
			needsRouteCapabilities: contractMetadata.requiresKV || contractMetadata.requiresFetch,
			routeHandlerName: routeHandlerName,
			handlerHasRequirePostGuard,
		};
	}

	if (unknownHandlerRoutes.length > 0) {
		throw new Error(
			`Unable to resolve handler function symbol for routes: ${unknownHandlerRoutes.sort().join(", ")}`,
		);
	}

	if (Object.keys(unsupportedRouteWrappers).length > 0) {
		const entries = Object.entries(unsupportedRouteWrappers).map(
			([route, wrappers]) => `${route}: ${wrappers.join(", ")}`,
		);
		throw new Error(
			`Unsupported route wrapper(s) in index.ts route registration: ${entries.join("; ")}`,
		);
	}

	const routeKeys = Object.keys(routeRecords).sort();
	const sortedRouteRecords = Object.fromEntries(routeKeys.map((route) => [route, routeRecords[route]]));

	return {
		routeCount: routeKeys.length,
		routeKeys,
		routeRecords: sortedRouteRecords,
		unknownPublicRoutes: unknownPublicRoutes.sort(),
	};
}

function generateComplianceTestSource() {
	return `import { describe, expect, it } from "vitest";

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
});`;
}

function generateContractRuleTestSource() {
	return [
		'import { describe, expect, it } from "vitest";',
		"",
		"// generated: do not edit directly",
		"",
		'import { COMMERCE_ROUTE_CONTRACTS } from "./route-contracts.js";',
		"",
		'const routeEntries = Object.entries(COMMERCE_ROUTE_CONTRACTS).sort(([a], [b]) => a.localeCompare(b));',
		"",
		"describe(\"route contract metadata rules\", () => {",
		"\tfor (const [route, contract] of routeEntries) {",
		'\t\tdescribe(`route: ${route}`, () => {',
		'\t\t\tit("must be POST-only", () => {',
		"\t\t\t\texpect(contract.method).toBe(\"POST\");",
		"\t\t\t});",
		"",
		'\t\t\tit("must expose an input schema", () => {',
		"\t\t\t\texpect(contract.inputSchema).toBeTruthy();",
		"\t\t\t});",
		"",
		'\t\t\tit("must keep replay fixture consistency", () => {',
		'\t\t\t\texpect(["none", "idempotency_key", "webhook_event"].includes(contract.replay)).toBe(true);',
		"\t\t\t\tif (contract.replay === \"none\") {",
		"\t\t\t\t\texpect(contract.fixtures).toBeUndefined();",
		"\t\t\t\t} else {",
		"\t\t\t\t\texpect(contract.fixtures).toBeDefined();",
		"\t\t\t\t\texpect(Array.isArray(contract.fixtures?.valid)).toBe(true);",
		"\t\t\t\t\texpect(Array.isArray(contract.fixtures?.invalid)).toBe(true);",
		"\t\t\t\t\texpect(Array.isArray(contract.fixtures?.replay)).toBe(true);",
		"\t\t\t\t\texpect((contract.fixtures?.valid?.length ?? 0)).toBeGreaterThan(0);",
		"\t\t\t\t\texpect((contract.fixtures?.invalid?.length ?? 0)).toBeGreaterThan(0);",
		"\t\t\t\t\texpect((contract.fixtures?.replay?.length ?? 0)).toBeGreaterThan(0);",
		"\t\t\t\t}",
		"\t\t\t});",
		"",
		'\t\t\tit("must keep side-effect intent coherent", () => {',
		"\t\t\t\tif (contract.sideEffectful) {",
		"\t\t\t\t\texpect(Array.isArray(contract.mutationCollections)).toBe(true);",
		"\t\t\t\t\texpect((contract.mutationCollections ?? []).length).toBeGreaterThan(0);",
		"\t\t\t\t}",
		"\t\t\t});",
		"",
		'\t\t\tit("must keep idempotency intent coherent", () => {',
		"\t\t\t\tif (contract.requiresIdempotencyKey) {",
		'\t\t\t\t\texpect(contract.replay).toBe("idempotency_key");',
		"\t\t\t\t\texpect(contract.sideEffectful).toBe(true);",
		"\t\t\t\t}",
		"\t\t\t});",
		"\t\t});",
		"\t}",
		"});",
		"",
	].join("\n");
}

function generateRouteSurfaceTestSource() {
	return `import { describe, expect, it } from "vitest";

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
`;
}



const payload = snapshotRoutes();
const surfacePayload = snapshotRouteSurfaceRoutes(payload.routeRecords);
writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
writeFileSync(SURFACE_OUTPUT_PATH, `${JSON.stringify(surfacePayload, null, 2)}\n`, "utf8");
writeFileSync(TEST_OUTPUT_PATH, `${generateComplianceTestSource()}\n`, "utf8");
writeFileSync(RULE_TEST_OUTPUT_PATH, `${generateContractRuleTestSource()}\n`, "utf8");
writeFileSync(SURFACE_TEST_OUTPUT_PATH, `${generateRouteSurfaceTestSource()}\n`, "utf8");
if (CHECK_MODE) {
	console.log("Snapshot and generated test updated in check mode.");
} else {
	console.log(`Wrote ${OUTPUT_PATH}`);
	console.log(`Wrote ${TEST_OUTPUT_PATH}`);
	console.log(`Wrote ${SURFACE_OUTPUT_PATH}`);
	console.log(`Wrote ${RULE_TEST_OUTPUT_PATH}`);
	console.log(`Wrote ${SURFACE_TEST_OUTPUT_PATH}`);
}

if (CHECK_MODE) {
	try {
		execSync(
			`git -C "${REPO_ROOT}" diff -- packages/plugins/commerce/src/contracts/route-compliance.generated.json packages/plugins/commerce/src/contracts/route-compliance-generated.test.ts packages/plugins/commerce/src/contracts/route-contract-rules.generated.test.ts packages/plugins/commerce/src/contracts/route-contract-surface.generated.json packages/plugins/commerce/src/contracts/route-contract-surface.generated.test.ts`,
			{ stdio: "pipe" },
		);
		const status = execSync(
			`git -C "${REPO_ROOT}" status --short -- packages/plugins/commerce/src/contracts/route-compliance.generated.json packages/plugins/commerce/src/contracts/route-compliance-generated.test.ts packages/plugins/commerce/src/contracts/route-contract-rules.generated.test.ts packages/plugins/commerce/src/contracts/route-contract-surface.generated.json packages/plugins/commerce/src/contracts/route-contract-surface.generated.test.ts`,
			{ encoding: "utf8" },
		).trim();
		if (status.length > 0) {
			throw new Error("untracked-or-modified");
		}
	} catch (error) {
		console.error(
			"Compliance snapshot drift detected. Re-run:\n  pnpm run generate:commerce-route-compliance-snapshot",
		);
		process.exit(1);
	}
}
