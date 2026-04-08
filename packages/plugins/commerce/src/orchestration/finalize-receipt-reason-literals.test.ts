import { readdirSync, readFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SOURCE_OF_TRUTH_FILE = join(SRC_ROOT, "kernel", "finalize-decision.ts");
const WEBHOOK_RECEIPT_LITERAL = /(['"`])webhook_receipt_[a-z_]+\1/g;
const NEWLINE_RE = /\r?\n/g;

type Violation = {
	file: string;
	line: number;
	reason: string;
};

function listFiles(directory: string): string[] {
	const files: string[] = [];
	const walk = (dir: string) => {
		const entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path);
				continue;
			}
			if (path.endsWith(".ts")) {
				files.push(path);
			}
		}
	};
	walk(directory);
	return files;
}

function findWebhookReceiptLiteralViolations(filePath: string): Violation[] {
	const text = readFileSync(filePath, "utf8");
	const lines = text.split(NEWLINE_RE);
	const violations: Violation[] = [];
	for (const [index, lineText] of lines.entries()) {
		const matches = lineText.matchAll(WEBHOOK_RECEIPT_LITERAL);
		for (const match of matches) {
			violations.push({
				file: relative(SRC_ROOT, filePath),
				line: index + 1,
				reason: match[0],
			});
		}
	}
	return violations;
}

describe("webhook receipt reason literals", () => {
	it("disallows direct webhook_receipt_* literals outside finalize-decision source of truth", () => {
		const files = listFiles(SRC_ROOT).filter((path) => path !== SOURCE_OF_TRUTH_FILE);
		const violations = files.flatMap((path) => findWebhookReceiptLiteralViolations(path));

		expect(violations).toEqual([]);
	});
});

