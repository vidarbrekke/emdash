#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const root = process.cwd();
const extBase = resolve(root, "..", "Dashing commerce PLANS/emdash-extensions");
const strictMode = process.argv.includes("--strict");
const hasExternalWorkspace = existsSync(extBase);

const checks = [];
const fail = (name, detail) => checks.push({ name, ok: false, detail });
const pass = (name) => checks.push({ name, ok: true, detail: "" });

const expectedExtensionModules = [
	"ai-moderation",
	"api-test",
	"atproto",
	"audit-log",
	"color",
	"embeds",
	"forms",
	"gdpr-plugin-starter",
	"marketplace",
	"marketplace-test",
	"sandboxed-test",
	"webhook-notifier",
	"x402",
];

if (hasExternalWorkspace) {
	pass("Extension workspace exists");
} else if (strictMode) {
	fail("Extension workspace exists", `Missing: ${extBase}`);
} else {
	pass("Extension workspace is optional in non-strict mode");
}

if (hasExternalWorkspace) {
	const actualModules = new Set(
		readdirSync(extBase, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name),
	);
	const missingModules = expectedExtensionModules.filter((moduleName) => !actualModules.has(moduleName));
	if (missingModules.length === 0) {
		pass("Required moved modules are present in extension workspace");
	} else {
		fail("Required moved modules are present in extension workspace", `Missing: ${missingModules.join(", ")}`);
	}
}

const packageDependencyTargets = [
	{
		path: join(root, "demos", "simple", "package.json"),
		expected: {
			"@emdash-cms/plugin-audit-log": "link:../Dashing commerce PLANS/emdash-extensions/audit-log",
			"@emdash-cms/plugin-color": "link:../Dashing commerce PLANS/emdash-extensions/color",
		},
	},
	{
		path: join(root, "templates", "blog", "package.json"),
		expected: {
			"@emdash-cms/plugin-audit-log": "link:../Dashing commerce PLANS/emdash-extensions/audit-log",
		},
	},
	{
		path: join(root, "demos", "plugins-demo", "package.json"),
		expected: {
			"@emdash-cms/plugin-audit-log": "link:../Dashing commerce PLANS/emdash-extensions/audit-log",
			"@emdash-cms/plugin-api-test": "link:../Dashing commerce PLANS/emdash-extensions/api-test",
			"@emdash-cms/plugin-webhook-notifier": "link:../Dashing commerce PLANS/emdash-extensions/webhook-notifier",
			"@emdash-cms/plugin-embeds": "link:../Dashing commerce PLANS/emdash-extensions/embeds",
		},
	},
	{
		path: join(root, "templates", "blog-cloudflare", "package.json"),
		expected: {
			"@emdash-cms/plugin-forms": "link:../Dashing commerce PLANS/emdash-extensions/forms",
			"@emdash-cms/plugin-webhook-notifier": "link:../Dashing commerce PLANS/emdash-extensions/webhook-notifier",
		},
	},
	{
		path: join(root, "demos", "cloudflare", "package.json"),
		expected: {
			"@emdash-cms/plugin-forms": "link:../Dashing commerce PLANS/emdash-extensions/forms",
			"@emdash-cms/plugin-webhook-notifier": "link:../Dashing commerce PLANS/emdash-extensions/webhook-notifier",
		},
	},
	{
		path: join(root, "e2e", "fixture", "package.json"),
		expected: {
			"@emdash-cms/plugin-color": "link:../../Dashing commerce PLANS/emdash-extensions/color",
		},
	},
	{
		path: join(root, "packages", "core", "tests", "integration", "fixture", "package.json"),
		expected: {
			"@emdash-cms/plugin-color": "link:../../../../Dashing commerce PLANS/emdash-extensions/color",
		},
	},
];

for (const entry of packageDependencyTargets) {
	if (!existsSync(entry.path)) {
		fail("Dependency map check", `Missing package manifest: ${entry.path}`);
		continue;
	}

	let pkg;
	try {
		pkg = JSON.parse(readFileSync(entry.path, "utf8"));
	} catch (error) {
		fail("Dependency map check", `Invalid JSON in ${entry.path}: ${error?.message || String(error)}`);
		continue;
	}

	const packageDependencies = pkg.dependencies ?? {};
	const packageDevDependencies = pkg.devDependencies ?? {};
	const deps = {
		...packageDependencies,
		...packageDevDependencies,
	};

	for (const [name, expectedValue] of Object.entries(entry.expected)) {
		if (deps[name] === expectedValue) {
			pass(`Dependency link: ${name} in ${entry.path}`);
		} else {
			fail(`Dependency link: ${name} in ${entry.path}`, `Expected ${expectedValue}, found ${String(deps[name])}`);
		}
	}
}

const workflowPath = join(root, ".github", "workflows", "preview-releases.yml");
if (existsSync(workflowPath)) {
	const workflow = readFileSync(workflowPath, "utf8");
	if (/x402|packages\/plugins\/(ai-moderation|api-test|atproto|audit-log|color|embeds|forms|webhook-notifier)/.test(workflow)) {
		fail("Preview publish list excludes removed extension packages", "Workflow still references removed extension package paths");
	} else {
		pass("Preview publish list excludes removed extension packages");
	}
} else {
	fail("Preview publish list excludes removed extension packages", `Missing workflow file: ${workflowPath}`);
}

const docsToReference = [
	join(root, "HANDOVER.md"),
	join(root, "gdpr-plugin-implementation-spec.md"),
	join(root, "commerce-plugin-architecture.md"),
];

if (hasExternalWorkspace) {
	docsToReference.push(join(extBase, "README.md"));
}

for (const p of docsToReference) {
	if (!existsSync(p)) {
		fail("Docs reference externalized extension path", `Missing file: ${p}`);
		continue;
	}
	const contents = readFileSync(p, "utf8");
	if (contents.includes("../Dashing commerce PLANS/emdash-extensions/")) {
		pass(`Docs reference externalized extension path in ${p}`);
	} else {
		fail(`Docs reference externalized extension path in ${p}`, "No explicit ../Dashing commerce PLANS/emdash-extensions path found");
	}
}

if (!hasExternalWorkspace && !strictMode) {
	pass("External extension workspace docs check skipped in non-strict mode");
}

const failed = checks.filter((c) => !c.ok);

for (const item of checks) {
	const prefix = item.ok ? "[PASS]" : "[FAIL]";
	console.log(`${prefix} ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
}

if (failed.length === 0) {
	console.log("\nCommerce backend readiness: READY");
	process.exit(0);
}

console.error(`\nCommerce backend readiness: BLOCKED (${failed.length} failures)`);
process.exit(1);
