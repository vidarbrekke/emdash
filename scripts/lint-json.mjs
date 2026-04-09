#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const baseArgs = ["exec", "oxlint", "-f", "json"];
const requestedArgs = process.argv.slice(2);
const forceTypeCheck = requestedArgs.includes("--force-type-check");
const commandArgs = requestedArgs.filter((arg) => arg !== "--force-type-check");
const hasFormatter = commandArgs.some(
	(arg) =>
		arg === "--format" ||
		arg === "-f" ||
		arg.startsWith("--format=") ||
		arg.startsWith("-f="),
);
const baseCommandArgs = hasFormatter ? ["exec", "oxlint"] : baseArgs;
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args) {
	const result = spawnSync(pnpmBin, [...baseCommandArgs, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return result;
}

function printResult(result) {
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
}

function runWithMode(mode) {
	return run([...commandArgs, mode]);
}

function isTsgolintCrash(result) {
	const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	return (
		result.signal === "SIGPIPE" ||
		combinedOutput.includes("invalid message type") ||
		combinedOutput.includes("Error running tsgolint")
	);
}

if (forceTypeCheck) {
	process.exit(runWithMode("--type-check").status ?? 1);
}

const primary = runWithMode("--type-aware");
if (primary.status === 0) {
	printResult(primary);
	process.exit(0);
}

if (!isTsgolintCrash(primary)) {
	printResult(primary);
	process.exit(primary.status ?? 1);
}

process.stderr.write("[lint:json] type-aware execution via tsgolint failed, falling back to --type-check.\n");
const fallback = runWithMode("--type-check");
printResult(fallback);
process.exit(fallback.status ?? 1);
