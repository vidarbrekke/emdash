import { describe, expect, it } from "vitest";

import { COMMERCE_STORAGE_CONFIG } from "../storage.js";

type IndexKind = string | readonly string[];

function includesIndex(
	collection:
		| "orders"
		| "carts"
		| "paymentAttempts"
		| "productAssets"
		| "productAssetLinks"
		| "webhookReceipts"
		| "idempotencyKeys"
		| "products"
		| "productSkus"
	| "productAttributes"
	| "productAttributeValues"
	| "productSkuOptionValues"
	| "digitalAssets"
	| "digitalEntitlements"
	| "categories"
	| "productCategoryLinks"
	| "productTags"
	| "productTagLinks"
	| "bundleComponents"
	| "inventoryLedger"
	| "inventoryStock",
	index: readonly string[],
	unique = false,
): boolean {
	const cfg = COMMERCE_STORAGE_CONFIG[collection];
	const bucket = unique
		? "uniqueIndexes" in cfg
			? ((cfg as { uniqueIndexes?: readonly IndexKind[] }).uniqueIndexes ?? [])
			: []
		: cfg.indexes;
	return bucket.some((entry: IndexKind) => {
		if (typeof entry === "string") {
			return index.length === 1 && entry === index[0];
		}
		return entry.length === index.length && entry.every((part, i) => part === index[i]);
	});
}

type QueryCoverageCollection = keyof typeof COMMERCE_STORAGE_CONFIG;

type QueryCoverageEntry = {
	collection: QueryCoverageCollection;
	where: readonly string[];
	orderBy?: readonly string[];
};

const QUERY_PATHS_WITH_INDEX_REQUIREMENTS: readonly QueryCoverageEntry[] = [
	{
		collection: "orders",
		where: ["cartId", "paymentPhase"],
	},
	{
		collection: "paymentAttempts",
		where: ["orderId", "providerId", "status"],
		orderBy: ["createdAt"],
	},
	{
		collection: "paymentAttempts",
		where: ["status"],
	},
	{
		collection: "inventoryLedger",
		where: ["referenceType", "referenceId"],
	},
	{
		collection: "productAssetLinks",
		where: ["targetType", "targetId"],
	},
	{
		collection: "productAssetLinks",
		where: ["targetType", "targetId", "role"],
	},
	{
		collection: "productCategoryLinks",
		where: ["productId"],
	},
	{
		collection: "productCategoryLinks",
		where: ["categoryId"],
	},
	{
		collection: "productTagLinks",
		where: ["productId"],
	},
	{
		collection: "productTagLinks",
		where: ["tagId"],
	},
	{
		collection: "products",
		where: ["slug"],
	},
	{
		collection: "products",
		where: ["type", "status", "visibility"],
	},
	{
		collection: "productSlugHistory",
		where: ["slug"],
	},
	{
		collection: "productSkus",
		where: ["productId"],
	},
	{
		collection: "productAttributes",
		where: ["productId"],
	},
	{
		collection: "productAttributeValues",
		where: ["attributeId"],
	},
	{
		collection: "productSkuOptionValues",
		where: ["skuId"],
	},
	{
		collection: "digitalEntitlements",
		where: ["skuId"],
	},
	{
		collection: "bundleComponents",
		where: ["bundleProductId"],
	},
	{
		collection: "idempotencyKeys",
		where: ["createdAt"],
		orderBy: ["createdAt"],
	},
	{
		collection: "categories",
		where: ["parentId"],
	},
];

function hasSingleFieldIndex(collection: QueryCoverageCollection, field: string): boolean {
	return includesIndex(collection, [field]) || includesIndex(collection, [field], true);
}

function hasQuerySupport(collection: QueryCoverageCollection, where: readonly string[], orderBy: readonly string[] = []): boolean {
	const allWhereIndexed = where.every((field) => hasSingleFieldIndex(collection, field));
	if (!allWhereIndexed) return false;
	if (!where.length) return true;
	if (where.length > 1 && includesIndex(collection, where)) return true;
	const allOrderByIndexed = orderBy.every((field) => hasSingleFieldIndex(collection, field));
	return allOrderByIndexed;
}

describe("storage index contracts", () => {
	it("supports every observed production query path with indexed predicates", () => {
		const observedByCollection = new Map<QueryCoverageCollection, { where: Set<string>; orderBy: Set<string> }>();
		for (const entry of QUERY_PATHS_WITH_INDEX_REQUIREMENTS) {
			const bucket = observedByCollection.get(entry.collection) ?? { where: new Set(), orderBy: new Set() };
			for (const field of entry.where) bucket.where.add(field);
			for (const field of entry.orderBy ?? []) bucket.orderBy.add(field);
			observedByCollection.set(entry.collection, bucket);
		}

		for (const [collection, usage] of observedByCollection.entries()) {
			const whereFields = [...usage.where];
			const orderByFields = [...usage.orderBy];
			expect(hasQuerySupport(collection, whereFields, orderByFields), `collection ${collection} query patterns are not index-supported`).toBe(true);
			for (const field of whereFields) {
				expect(hasSingleFieldIndex(collection, field), `collection ${collection} query.where.${field} is indexed`).toBe(true);
			}
			for (const field of orderByFields) {
				expect(hasSingleFieldIndex(collection, field), `collection ${collection} query.orderBy.${field} is indexed`).toBe(true);
			}
		}
	});

	it("supports payment attempt lookup path used by finalize/idempotency", () => {
		expect(includesIndex("paymentAttempts", ["orderId", "providerId", "status"])).toBe(true);
	});

	it("supports inventory reconciliation lookup path for finalize", () => {
		expect(includesIndex("inventoryLedger", ["referenceType", "referenceId"])).toBe(true);
	});

	it("contains required unique constraints for duplicate-safe writes", () => {
		expect(includesIndex("webhookReceipts", ["providerId", "externalEventId"], true)).toBe(true);
		expect(includesIndex("idempotencyKeys", ["keyHash", "route"], true)).toBe(true);
		expect(
			includesIndex(
				"inventoryLedger",
				["referenceType", "referenceId", "productId", "variantId"],
				true,
			),
		).toBe(true);
	});

	it("keeps deterministic index coverage for status-read diagnostics path", () => {
		expect(includesIndex("inventoryStock", ["productId", "variantId"], true)).toBe(true);
		expect(includesIndex("paymentAttempts", ["orderId", "providerId", "status"])).toBe(true);
	});

	it("supports catalog product lookup and uniqueness invariants", () => {
		expect(includesIndex("products", ["slug"])).toBe(true);
		expect(includesIndex("products", ["slug"], true)).toBe(true);
		expect(includesIndex("products", ["status"])).toBe(true);
	});

	it("supports catalog SKU lookup and sku-code uniqueness invariants", () => {
		expect(includesIndex("productSkus", ["productId"])).toBe(true);
		expect(includesIndex("productSkus", ["skuCode"], true)).toBe(true);
	});

	it("supports catalog asset records and lookup invariants", () => {
		expect(includesIndex("productAssets", ["provider", "externalAssetId"])).toBe(true);
		expect(includesIndex("productAssets", ["provider", "externalAssetId"], true)).toBe(true);
	});

	it("supports catalog asset link lookup and idempotent linking", () => {
		expect(includesIndex("productAssetLinks", ["targetType", "targetId"])).toBe(true);
		expect(includesIndex("productAssetLinks", ["targetType", "targetId", "assetId"], true)).toBe(true);
	});

	it("supports variable attribute metadata lookups", () => {
		expect(includesIndex("productAttributes", ["productId"])).toBe(true);
		expect(includesIndex("productAttributes", ["productId", "kind"])).toBe(true);
		expect(includesIndex("productAttributes", ["productId", "code"], true)).toBe(true);
		expect(includesIndex("productAttributeValues", ["attributeId"])).toBe(true);
		expect(includesIndex("productAttributeValues", ["attributeId", "code"], true)).toBe(true);
	});

	it("supports SKU option mapping invariants", () => {
		expect(includesIndex("productSkuOptionValues", ["skuId"])).toBe(true);
		expect(includesIndex("productSkuOptionValues", ["attributeId"])).toBe(true);
		expect(includesIndex("productSkuOptionValues", ["skuId", "attributeId"], true)).toBe(true);
	});

	it("supports digital asset records and entitlements", () => {
		expect(includesIndex("digitalAssets", ["provider", "externalAssetId"])).toBe(true);
		expect(includesIndex("digitalAssets", ["provider", "externalAssetId"], true)).toBe(true);
		expect(includesIndex("digitalEntitlements", ["skuId"])).toBe(true);
		expect(includesIndex("digitalEntitlements", ["digitalAssetId"])).toBe(true);
		expect(includesIndex("digitalEntitlements", ["skuId", "digitalAssetId"], true)).toBe(true);
	});

	it("supports bundle components and composition lookups", () => {
		expect(includesIndex("bundleComponents", ["bundleProductId"])).toBe(true);
		expect(includesIndex("bundleComponents", ["bundleProductId", "componentSkuId"], true)).toBe(true);
		expect(includesIndex("bundleComponents", ["bundleProductId", "position"])).toBe(true);
	});

	it("supports catalog organization lookup indexes", () => {
		expect(includesIndex("categories", ["slug"])).toBe(true);
		expect(includesIndex("categories", ["slug"], true)).toBe(true);
		expect(includesIndex("categories", ["parentId"])).toBe(true);
		expect(includesIndex("productCategoryLinks", ["productId"])).toBe(true);
		expect(includesIndex("productCategoryLinks", ["categoryId"])).toBe(true);
		expect(includesIndex("productCategoryLinks", ["productId", "categoryId"], true)).toBe(true);
		expect(includesIndex("productTags", ["slug"])).toBe(true);
		expect(includesIndex("productTags", ["slug"], true)).toBe(true);
		expect(includesIndex("productTagLinks", ["productId"])).toBe(true);
		expect(includesIndex("productTagLinks", ["tagId"])).toBe(true);
		expect(includesIndex("productTagLinks", ["productId", "tagId"], true)).toBe(true);
	});
});
