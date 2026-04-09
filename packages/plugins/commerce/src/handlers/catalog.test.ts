import type { RouteContext } from "emdash";
import { describe, expect, it } from "vitest";

import type {
	StoredProduct,
	StoredProductAsset,
	StoredProductAssetLink,
	StoredProductAttribute,
	StoredProductAttributeValue,
	StoredProductSlugHistory,
	StoredBundleComponent,
	StoredDigitalAsset,
	StoredDigitalEntitlement,
	StoredCategory,
	StoredProductCategoryLink,
	StoredProductTag,
	StoredProductTagLink,
	StoredProductSku,
	StoredProductSkuOptionValue,
	StoredInventoryStock,
} from "../types.js";
import type {
	ProductAssetLinkInput,
	ProductAssetReorderInput,
	ProductAssetRegisterInput,
	ProductAssetUnlinkInput,
	ProductSkuCreateInput,
	ProductSkuUpdateInput,
	ProductCreateInput,
	ProductUpdateInput,
	DigitalAssetCreateInput,
	DigitalEntitlementCreateInput,
	BundleComponentAddInput,
	BundleComponentRemoveInput,
	BundleComponentReorderInput,
	BundleComputeInput,
	CategoryCreateInput,
	CategoryListInput,
	ProductCategoryLinkInput,
	ProductCategoryUnlinkInput,
	ProductListInput,
	TagCreateInput,
	ProductTagLinkInput,
	ProductTagUnlinkInput,
} from "../schemas.js";
import {
	productAssetLinkInputSchema,
	productAssetReorderInputSchema,
	productAssetRegisterInputSchema,
	productAssetUnlinkInputSchema,
	productCreateInputSchema,
	digitalAssetCreateInputSchema,
	digitalEntitlementCreateInputSchema,
	categoryCreateInputSchema,
	categoryListInputSchema,
	productCategoryLinkInputSchema,
	productCategoryUnlinkInputSchema,
	tagCreateInputSchema,
	tagListInputSchema,
	productTagLinkInputSchema,
	productTagUnlinkInputSchema,
	bundleComponentAddInputSchema,
	productUpdateInputSchema,
} from "../schemas.js";
import { COMMERCE_LIMITS } from "../kernel/limits.js";
import { sortedImmutable } from "../lib/sort-immutable.js";
import { inventoryStockDocId } from "../lib/inventory-stock.js";
import {
	createProductHandler,
	setProductStateHandler,
	createProductSkuHandler,
	getProductHandler,
	getStorefrontProductHandler,
	setSkuStatusHandler,
	updateProductHandler,
	updateProductSkuHandler,
	linkCatalogAssetHandler,
	reorderCatalogAssetHandler,
	registerProductAssetHandler,
	unlinkCatalogAssetHandler,
	listProductsHandler,
	listStorefrontProductsHandler,
	listProductSkusHandler,
	listStorefrontProductSkusHandler,
	createCategoryHandler,
	listCategoriesHandler,
	createProductCategoryLinkHandler,
	removeProductCategoryLinkHandler,
	createTagHandler,
	listTagsHandler,
	createProductTagLinkHandler,
	removeProductTagLinkHandler,
	addBundleComponentHandler,
	reorderBundleComponentHandler,
	removeBundleComponentHandler,
	bundleComputeHandler,
	bundleComputeStorefrontHandler,
	createDigitalAssetHandler,
	createDigitalEntitlementHandler,
	removeDigitalEntitlementHandler,
	getStorefrontProductBySlugHandler,
} from "./catalog.js";
import {
	CATALOG_ADMIN_PRODUCT_KEYS,
	CATALOG_ADMIN_PRODUCT_PRODUCT_KEYS,
	CATALOG_STOREFRONT_LIST_ITEM_KEYS,
	CATALOG_STOREFRONT_LIST_ITEM_PRODUCT_KEYS,
} from "./response-contract-fixtures.js";

const PRODUCT_ID_PREFIX = /^prod_/;
const SKU_ID_PREFIX = /^sku_/;
const ASSET_ID_PREFIX = /^asset_/;

class MemColl<T extends object> {
	constructor(public readonly rows = new Map<string, T>()) {}

	async get(id: string): Promise<T | null> {
		const row = this.rows.get(id);
		return row ? structuredClone(row) : null;
	}

	async put(id: string, data: T): Promise<void> {
		this.rows.set(id, structuredClone(data));
	}

	async getMany(ids: string[]): Promise<Map<string, T>> {
		const rows = new Map<string, T>();
		for (const id of ids) {
			const row = this.rows.get(id);
			if (row) {
				rows.set(id, structuredClone(row));
			}
		}
		return rows;
	}

	async delete(id: string): Promise<boolean> {
		return this.rows.delete(id);
	}

	async deleteMany(ids: string[]): Promise<number> {
		let count = 0;
		for (const id of ids) {
			if (this.rows.delete(id)) {
				count++;
			}
		}
		return count;
	}

	async query(options?: {
		where?: Record<string, unknown>;
		limit?: number;
	}): Promise<{ items: Array<{ id: string; data: T }>; hasMore: boolean }> {
		const where = options?.where ?? {};
		const values = [...this.rows.entries()].filter(([, row]) =>
			Object.entries(where).every(([field, expected]) => {
				const rowValue = (row as Record<string, unknown>)[field];
				if (expected && typeof expected === "object" && !Array.isArray(expected)) {
					const maybeInFilter = expected as { in?: unknown[] };
					if (Array.isArray(maybeInFilter.in)) {
						return maybeInFilter.in.includes(rowValue);
					}
				}
				return rowValue === expected;
			}),
		);
		const items = values
			.slice(0, options?.limit ?? 50)
			.map(([id, row]) => ({ id, data: structuredClone(row) }));
		return { items, hasMore: false };
	}

	async putMany(items: Array<{ id: string; data: T }>): Promise<void> {
		for (const item of items) {
			await this.put(item.id, structuredClone(item.data));
		}
	}

	async exists(id: string): Promise<boolean> {
		return this.rows.has(id);
	}

	async count(where?: Record<string, unknown>): Promise<number> {
		if (!where || Object.keys(where).length === 0) {
			return this.rows.size;
		}
		const filtered = [...this.rows.entries()].filter(([, row]) =>
			Object.entries(where).every(([field, expected]) => {
				const rowValue = row[field as keyof typeof row];
				if (expected && typeof expected === "object" && !Array.isArray(expected)) {
					const maybeInFilter = expected as { in?: unknown[] };
					if (Array.isArray(maybeInFilter.in)) {
						return maybeInFilter.in.includes(rowValue);
					}
				}
				return rowValue === expected;
			}),
		);
		return filtered.length;
	}
}

class ConstraintConflictMemColl<T extends object> extends MemColl<T> {
	constructor(
		private readonly conflicts: (existing: T, next: T) => boolean,
		rows: Map<string, T> = new Map<string, T>(),
	) {
		super(rows);
	}

	async putIfAbsent(id: string, data: T): Promise<boolean> {
		for (const existing of this.rows.values()) {
			if (this.conflicts(existing, data)) {
				return false;
			}
		}
		await this.put(id, structuredClone(data));
		return true;
	}

	override async query(
		_options?: {
			[key: string]: unknown;
		},
	): Promise<{ items: Array<{ id: string; data: T }>; hasMore: boolean }> {
		return { items: [], hasMore: false };
	}
}

class QueryCountingMemColl<T extends object> extends MemColl<T> {
	queryCount = 0;

	override async query(options?: {
		where?: Record<string, unknown>;
		limit?: number;
	}): Promise<{ items: Array<{ id: string; data: T }>; hasMore: boolean }> {
		this.queryCount += 1;
		return super.query(options);
	}
}

class PagedQueryMemColl<T extends object> extends MemColl<T> {
	constructor(rows = new Map<string, T>(), private readonly pageSize = 100) {
		super(rows);
	}

	override async query(options?: {
		where?: Record<string, unknown>;
		cursor?: string;
		limit?: number;
	}): Promise<{ items: Array<{ id: string; data: T }>; hasMore: boolean; cursor?: string }> {
		const where = options?.where ?? {};
		const start = Number.parseInt(options?.cursor ?? "0", 10) || 0;
		const limit = options?.limit ?? this.pageSize;
		const rows = [...this.rows.entries()].filter(([, row]) =>
			Object.entries(where).every(([field, expected]) => {
				const rowValue = (row as Record<string, unknown>)[field];
				if (expected && typeof expected === "object" && !Array.isArray(expected)) {
					const maybeInFilter = expected as { in?: unknown[] };
					if (Array.isArray(maybeInFilter.in)) {
						return maybeInFilter.in.includes(rowValue);
					}
				}
				return rowValue === expected;
			}),
		);
		const nextStart = Math.min(start + limit, rows.length);
		const items = rows
			.slice(start, nextStart)
			.map(([id, row]) => ({ id, data: structuredClone(row) }));
		const hasMore = nextStart < rows.length;
		return { items, hasMore, cursor: hasMore ? String(nextStart) : undefined };
	}
}

function withFailingPutOnNth<T extends object>(collection: MemColl<T>, failOnCall: number, message = "mutation persistence failure"): MemColl<T> {
	let putCalls = 0;
	return {
		get rows() {
			return collection.rows;
		},
		get: collection.get.bind(collection),
		query: collection.query.bind(collection),
		put: async (id: string, data: T): Promise<void> => {
			putCalls += 1;
			if (putCalls === failOnCall) {
				throw new Error(message);
			}
			await collection.put(id, data);
		},
		delete: collection.delete.bind(collection),
	} as MemColl<T>;
}

function withFailingDeleteOnNth<T extends object>(collection: MemColl<T>, failOnCall: number, message = "mutation delete failure"): MemColl<T> {
	let deleteCalls = 0;
	return {
		get rows() {
			return collection.rows;
		},
		get: collection.get.bind(collection),
		query: collection.query.bind(collection),
		put: collection.put.bind(collection),
		delete: async (id: string): Promise<boolean> => {
			deleteCalls += 1;
			if (deleteCalls === failOnCall) {
				throw new Error(message);
			}
			return collection.delete(id);
		},
	} as MemColl<T>;
}

function catalogCtx<TInput>(
	input: TInput,
	products: MemColl<StoredProduct>,
	productSkus = new MemColl<StoredProductSku>(),
	productAssets = new MemColl<StoredProductAsset>(),
	productAssetLinks = new MemColl<StoredProductAssetLink>(),
	productAttributes = new MemColl<StoredProductAttribute>(),
	productAttributeValues = new MemColl<StoredProductAttributeValue>(),
	productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>(),
	bundleComponents = new MemColl<StoredBundleComponent>(),
	categories = new MemColl<StoredCategory>(),
	productCategoryLinks = new MemColl<StoredProductCategoryLink>(),
	productTags = new MemColl<StoredProductTag>(),
	productTagLinks = new MemColl<StoredProductTagLink>(),
	digitalAssets = new MemColl<StoredDigitalAsset>(),
	digitalEntitlements = new MemColl<StoredDigitalEntitlement>(),
	inventoryStock = new MemColl<StoredInventoryStock>(),
	productSlugHistory = new MemColl<StoredProductSlugHistory>(),
): RouteContext<TInput> {
	return {
		request: new Request("https://example.test/catalog", { method: "POST" }),
		input,
		storage: {
			products,
			productSkus,
			productAssets,
			productAssetLinks,
			productAttributes,
			productAttributeValues,
			productSkuOptionValues,
			bundleComponents,
			categories,
			productCategoryLinks,
			productTags,
			productTagLinks,
		digitalAssets,
		digitalEntitlements,
		inventoryStock,
		productSlugHistory,
		},
		requestMeta: { ip: "127.0.0.1" },
		kv: {},
	} as unknown as RouteContext<TInput>;
}

function catalogCtxWithMethod<TInput>(ctx: RouteContext<TInput>, method: "GET" | "POST" | "HEAD" | "PUT" | "PATCH" | "DELETE"): RouteContext<TInput> {
	return {
		...ctx,
		request: new Request("https://example.test/catalog", { method }),
	} as unknown as RouteContext<TInput>;
}

function catalogCtxWithInventoryStock<TInput>(
	input: TInput,
	products: MemColl<StoredProduct>,
	productSkus: MemColl<StoredProductSku>,
	inventoryStock: MemColl<StoredInventoryStock>,
): RouteContext<TInput> {
	const ctx = catalogCtx(
		input,
		products,
		productSkus,
	);
	return {
		...ctx,
		storage: {
			...ctx.storage,
			inventoryStock,
		},
	} as unknown as RouteContext<TInput>;
}

describe("catalog product handlers", () => {
	it("creates a product and persists it in storage", async () => {
		const products = new MemColl<StoredProduct>();
		const out = await createProductHandler(
			catalogCtx(
				{
					type: "simple",
					status: "draft",
					visibility: "hidden",
					slug: "simple-runner",
					title: "Simple Runner",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
				},
				products,
			),
		);

		expect(out.product.id).toMatch(PRODUCT_ID_PREFIX);
		expect(products.rows.size).toBe(1);
	});

	it("rejects duplicate product slugs", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "dup",
			title: "Existing",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const ctx = catalogCtx<ProductCreateInput>(
			{
				type: "simple",
				status: "draft",
				visibility: "hidden",
				slug: "dup",
				title: "Duplicate",
				shortDescription: "",
				longDescription: "",
				featured: false,
				sortOrder: 1,
				requiresShippingDefault: true,
			},
			products,
		);
		await expect(createProductHandler(ctx)).rejects.toMatchObject({ code: "bad_request" });
	});

	it("uses storage conflict on duplicate product slug insert", async () => {
		const products = new ConstraintConflictMemColl<StoredProduct>((existing, next) => {
			return existing.slug === next.slug;
		});
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "dup",
			title: "Existing",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const ctx = catalogCtx<ProductCreateInput>(
			{
				type: "simple",
				status: "draft",
				visibility: "hidden",
				slug: "dup",
				title: "Duplicate",
				shortDescription: "",
				longDescription: "",
				featured: false,
				sortOrder: 1,
				requiresShippingDefault: true,
			},
			products,
		);

		await expect(createProductHandler(ctx)).rejects.toMatchObject({
			code: "bad_request",
			message: "Product slug already exists: dup",
		});
	});

	it("rejects duplicate slugs on product update", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "first",
			title: "Existing One",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_2", {
			id: "prod_2",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "second",
			title: "Existing Two",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const duplicate = updateProductHandler(
			catalogCtx(
				{
					productId: "prod_1",
					slug: "second",
				},
				products,
			),
		);
		await expect(duplicate).rejects.toMatchObject({ code: "bad_request" });
	});

	it("creates variable products with variant attributes and values", async () => {
		const products = new MemColl<StoredProduct>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();

		const out = await createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "draft",
					visibility: "hidden",
					slug: "tee-shirt",
					title: "Tee Shirt",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [
								{ value: "Red", code: "red", position: 0 },
								{ value: "Blue", code: "blue", position: 1 },
							],
						},
						{
							name: "Size",
							code: "size",
							kind: "variant_defining",
							position: 1,
							values: [
								{ value: "Small", code: "s", position: 0 },
								{ value: "Large", code: "l", position: 1 },
							],
						},
					],
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
			),
		);

		expect(out.product.type).toBe("variable");
		expect(productAttributes.rows.size).toBe(2);
		expect(productAttributeValues.rows.size).toBe(4);
	});

	it("rejects variable products without variant-defining attributes", async () => {
		const products = new MemColl<StoredProduct>();
		const out = createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "draft",
					visibility: "hidden",
					slug: "bad-variable",
					title: "Bad Variable",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Material",
							code: "material",
							kind: "descriptive",
							position: 0,
							values: [{ value: "Cotton", code: "cotton", position: 0 }],
						},
					],
				},
				products,
			),
		);
		await expect(out).rejects.toMatchObject({ code: "bad_request" });
	});

	it("rejects variable products with duplicate attribute codes", async () => {
		const products = new MemColl<StoredProduct>();
		const out = createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "draft",
					visibility: "hidden",
					slug: "dup-attr",
					title: "Dup Attr",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [{ value: "Red", code: "red", position: 0 }],
						},
						{
							name: "Color Alt",
							code: "color",
							kind: "variant_defining",
							position: 1,
							values: [{ value: "Blue", code: "blue", position: 0 }],
						},
					],
				},
				products,
			),
		);
		await expect(out).rejects.toMatchObject({ code: "bad_request" });
	});

	it("rejects duplicate value codes within a variable attribute", async () => {
		const products = new MemColl<StoredProduct>();
		const out = createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "draft",
					visibility: "hidden",
					slug: "dup-value",
					title: "Dup Value",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [
								{ value: "Red", code: "red", position: 0 },
								{ value: "Maroon", code: "red", position: 1 },
							],
						},
					],
				},
				products,
			),
		);
		await expect(out).rejects.toMatchObject({ code: "bad_request" });
	});

	it("auto-pauses existing variable SKUs after attribute updates", async () => {
		const products = new MemColl<StoredProduct>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkus = new MemColl<StoredProductSku>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();

		await products.put("prod_var", {
			id: "prod_var",
			type: "variable",
			status: "active",
			visibility: "public",
			slug: "socks",
			title: "Sock Set",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAttributes.put("attr_color", {
			id: "attr_color",
			productId: "prod_var",
			name: "Color",
			code: "color",
			kind: "variant_defining",
			position: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAttributeValues.put("val_color_red", {
			id: "val_color_red",
			attributeId: "attr_color",
			value: "Red",
			code: "red",
			position: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productSkus.put("sku_active", {
			id: "sku_active",
			productId: "prod_var",
			skuCode: "VAR-RED",
			status: "active",
			unitPriceMinor: 1200,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productSkuOptionValues.put("opt_red", {
			id: "opt_red",
			skuId: "sku_active",
			attributeId: "attr_color",
			attributeValueId: "val_color_red",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await updateProductHandler(
			catalogCtx(
				{
					productId: "prod_var",
					attributes: [
						{
							name: "Material",
							code: "material",
							kind: "variant_defining",
							position: 0,
							values: [{ value: "Wool", code: "wool", position: 0 }],
						},
					],
				},
				products,
				productSkus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		const updatedSku = await productSkus.get("sku_active");
		expect(updatedSku).toMatchObject({
			status: "inactive",
			lifecycleState: "auto_paused",
			lifecycleStateReason: "Attribute updates require manual SKU review",
		});
		const remainingAttributeValues = (await productAttributeValues.query({ where: { attributeId: "attr_color" } })).items;
		expect(remainingAttributeValues).toHaveLength(0);
		const remainingOptions = (await productSkuOptionValues.query({ where: { skuId: "sku_active" } })).items;
		expect(remainingOptions).toHaveLength(0);
		const currentAttributes = (await productAttributes.query({ where: { productId: "prod_var" } })).items;
		expect(currentAttributes).toHaveLength(1);
	});

	it("preserves existing variable product attributes when replacement fails mid-write", async () => {
		const products = new MemColl<StoredProduct>();
		const productSkus = new MemColl<StoredProductSku>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();

		await products.put("prod_var", {
			id: "prod_var",
			type: "variable",
			status: "draft",
			visibility: "hidden",
			slug: "variable-product",
			title: "Variable Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAttributes.put("attr_existing", {
			id: "attr_existing",
			productId: "prod_var",
			name: "Size",
			code: "size",
			kind: "variant_defining",
			position: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAttributeValues.put("val_existing_s", {
			id: "val_existing_s",
			attributeId: "attr_existing",
			value: "Small",
			code: "s",
			position: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const failingProductAttributeValues = withFailingPutOnNth(productAttributeValues, 1);

		await expect(
			updateProductHandler(
				catalogCtx(
					{
						productId: "prod_var",
						attributes: [
							{
								name: "Color",
								code: "color",
								kind: "variant_defining",
								position: 0,
								values: [{ value: "Red", code: "red", position: 0 }],
							},
						],
					},
					products,
					productSkus,
					new MemColl(),
					new MemColl(),
					productAttributes,
					failingProductAttributeValues,
					productSkuOptionValues,
				),
			),
		).rejects.toThrow("mutation persistence failure");

		const existingAttributes = (await productAttributes.query({ where: { productId: "prod_var" } })).items;
		expect(existingAttributes).toHaveLength(1);
		expect(existingAttributes[0]?.data).toMatchObject({
			id: "attr_existing",
			code: "size",
		});

		const existingValues = (await productAttributeValues.query({ where: { attributeId: "attr_existing" } })).items;
		expect(existingValues).toHaveLength(1);
		expect(existingValues[0]?.data).toMatchObject({
			id: "val_existing_s",
			code: "s",
			value: "Small",
		});
	});

	it("does not lose existing attributes and SKU option mappings when attribute replacement cleanup fails", async () => {
		const products = new MemColl<StoredProduct>();
		const productSkus = new MemColl<StoredProductSku>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();

		await products.put("prod_var", {
			id: "prod_var",
			type: "variable",
			status: "draft",
			visibility: "hidden",
			slug: "variable-product-cleanup-fail",
			title: "Variable Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAttributes.put("attr_existing", {
			id: "attr_existing",
			productId: "prod_var",
			name: "Color",
			code: "color",
			kind: "variant_defining",
			position: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAttributeValues.put("val_existing_red", {
			id: "val_existing_red",
			attributeId: "attr_existing",
			value: "Red",
			code: "red",
			position: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productSkus.put("sku_1", {
			id: "sku_1",
			productId: "prod_var",
			skuCode: "SKU-1",
			status: "active",
			unitPriceMinor: 1299,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productSkuOptionValues.put("sku_1_color_red", {
			id: "sku_1_color_red",
			skuId: "sku_1",
			attributeId: "attr_existing",
			attributeValueId: "val_existing_red",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const failingProductAttributeValues = withFailingDeleteOnNth(productAttributeValues, 1);

		await expect(
			updateProductHandler(
				catalogCtx(
					{
						productId: "prod_var",
						attributes: [
							{
								name: "Material",
								code: "material",
								kind: "variant_defining",
								position: 0,
								values: [{ value: "Wool", code: "wool", position: 0 }],
							},
						],
					},
					products,
					productSkus,
					new MemColl(),
					new MemColl(),
					productAttributes,
					failingProductAttributeValues,
					productSkuOptionValues,
				),
			),
		).rejects.toThrow("mutation delete failure");

		const existingAttributes = (await productAttributes.query({ where: { productId: "prod_var" } })).items;
		expect(existingAttributes).toHaveLength(1);
		expect(existingAttributes[0]?.data).toMatchObject({
			id: "attr_existing",
			code: "color",
		});

		const existingValues = (await failingProductAttributeValues.query({ where: { attributeId: "attr_existing" } })).items;
		expect(existingValues).toHaveLength(1);
		expect(existingValues[0]?.data).toMatchObject({
			id: "val_existing_red",
			code: "red",
		});

		const existingOptions = (await productSkuOptionValues.query({ where: { skuId: "sku_1" } })).items;
		expect(existingOptions).toHaveLength(1);
		expect(existingOptions[0]?.data).toMatchObject({
			id: "sku_1_color_red",
			attributeValueId: "val_existing_red",
		});
	});

	it("replaces variable attributes across paged existing rows", async () => {
		const products = new MemColl<StoredProduct>();
		const productSkus = new PagedQueryMemColl<StoredProductSku>();
		const productAttributes = new PagedQueryMemColl<StoredProductAttribute>();
		const productAttributeValues = new PagedQueryMemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new PagedQueryMemColl<StoredProductSkuOptionValue>();
		const totalRows = 110;
		const now = "2026-01-01T00:00:00.000Z";

		await products.put("prod_var", {
			id: "prod_var",
			type: "variable",
			status: "draft",
			visibility: "hidden",
			slug: "variable-product-paged-replace",
			title: "Variable Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: now,
			updatedAt: now,
		});

		for (let index = 0; index < totalRows; index += 1) {
			await productAttributes.put(`attr_${index}`, {
				id: `attr_${index}`,
				productId: "prod_var",
				name: `Attribute ${index}`,
				code: `attr_${index}`,
				kind: "variant_defining",
				position: index,
				createdAt: now,
				updatedAt: now,
			});
			await productAttributeValues.put(`val_${index}`, {
				id: `val_${index}`,
				attributeId: `attr_${index}`,
				value: `Value ${index}`,
				code: `val_${index}`,
				position: index,
				createdAt: now,
				updatedAt: now,
			});
		}

		for (let index = 0; index < totalRows; index += 1) {
			const skuId = `sku_${index}`;
			await productSkus.put(skuId, {
				id: skuId,
				productId: "prod_var",
				skuCode: `SKU-${index}`,
				status: "active",
				unitPriceMinor: 1000,
				inventoryQuantity: 5,
				inventoryVersion: 1,
				requiresShipping: true,
				isDigital: false,
				createdAt: now,
				updatedAt: now,
			});
			await productSkuOptionValues.put(`opt_${index}`, {
				id: `opt_${index}`,
				skuId,
				attributeId: `attr_${index}`,
				attributeValueId: `val_${index}`,
				createdAt: now,
				updatedAt: now,
			});
		}

		await updateProductHandler(
			catalogCtx<ProductUpdateInput>(
				{
					productId: "prod_var",
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [{ value: "Red", code: "red", position: 0 }],
						},
					],
				},
				products,
				productSkus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		expect(productAttributes.rows.size).toBe(1);
		expect(productAttributeValues.rows.size).toBe(1);
		expect(productSkuOptionValues.rows.size).toBe(0);
		expect(Array.from(productAttributes.rows.values(), (attribute) => attribute.code)).toEqual(["color"]);
		expect(Array.from(productAttributeValues.rows.values(), (value) => value.code)).toEqual(["red"]);
	});

	it("restores all paged attribute data when cleanup fails mid option deletion", async () => {
		const products = new MemColl<StoredProduct>();
		const productSkus = new PagedQueryMemColl<StoredProductSku>();
		const productAttributes = new PagedQueryMemColl<StoredProductAttribute>();
		const productAttributeValues = new PagedQueryMemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new PagedQueryMemColl<StoredProductSkuOptionValue>();
		const totalRows = 110;
		const now = "2026-01-01T00:00:00.000Z";

		await products.put("prod_var", {
			id: "prod_var",
			type: "variable",
			status: "draft",
			visibility: "hidden",
			slug: "variable-product-paged-replace-fail",
			title: "Variable Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: now,
			updatedAt: now,
		});

		for (let index = 0; index < totalRows; index += 1) {
			await productAttributes.put(`attr_${index}`, {
				id: `attr_${index}`,
				productId: "prod_var",
				name: `Attribute ${index}`,
				code: `attr_${index}`,
				kind: "variant_defining",
				position: index,
				createdAt: now,
				updatedAt: now,
			});
			await productAttributeValues.put(`val_${index}`, {
				id: `val_${index}`,
				attributeId: `attr_${index}`,
				value: `Value ${index}`,
				code: `val_${index}`,
				position: index,
				createdAt: now,
				updatedAt: now,
			});
		}

		for (let index = 0; index < totalRows; index += 1) {
			const skuId = `sku_${index}`;
			await productSkus.put(skuId, {
				id: skuId,
				productId: "prod_var",
				skuCode: `SKU-${index}`,
				status: "active",
				unitPriceMinor: 1000,
				inventoryQuantity: 5,
				inventoryVersion: 1,
				requiresShipping: true,
				isDigital: false,
				createdAt: now,
				updatedAt: now,
			});
			await productSkuOptionValues.put(`opt_${index}`, {
				id: `opt_${index}`,
				skuId,
				attributeId: `attr_${index}`,
				attributeValueId: `val_${index}`,
				createdAt: now,
				updatedAt: now,
			});
		}

		const failingProductSkuOptionValues = withFailingDeleteOnNth(productSkuOptionValues, 101);

		await expect(
			updateProductHandler(
				catalogCtx<ProductUpdateInput>(
					{
						productId: "prod_var",
						attributes: [
							{
								name: "Color",
								code: "color",
								kind: "variant_defining",
								position: 0,
								values: [{ value: "Red", code: "red", position: 0 }],
							},
						],
					},
					products,
					productSkus,
					new MemColl(),
					new MemColl(),
					productAttributes,
					productAttributeValues,
					failingProductSkuOptionValues,
				),
			),
		).rejects.toThrow("mutation delete failure");

		expect(productAttributes.rows.size).toBe(totalRows);
		expect(productAttributeValues.rows.size).toBe(totalRows);
		expect(failingProductSkuOptionValues.rows.size).toBe(totalRows);
		const firstAttribute = productAttributes.rows.get("attr_0");
		expect(firstAttribute).toMatchObject({ id: "attr_0", code: "attr_0" });
		const firstValue = productAttributeValues.rows.get("val_0");
		expect(firstValue).toMatchObject({ id: "val_0", code: "val_0" });
		expect(Array.from(failingProductSkuOptionValues.rows.values(), (option) => option.skuId).every((skuId) => skuId.startsWith("sku_"))).toBe(true);
	});

	it("updates mutable product fields and preserves immutable fields", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "draft",
			visibility: "hidden",
			slug: "editable",
			title: "Original",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			archivedAt: undefined,
			publishedAt: undefined,
		});

		const out = await updateProductHandler(
			catalogCtx(
				{
					productId: "prod_1",
					title: "Updated Title",
					featured: true,
				},
				products,
			),
		);

		expect(out.product.title).toBe("Updated Title");
		expect(out.product.featured).toBe(true);
		expect(out.product.id).toBe("prod_1");
		expect(out.product.type).toBe("simple");
		expect(out.product.createdAt).toBe("2026-01-01T00:00:00.000Z");
	});

	it("records slug history when slug changes", async () => {
		const products = new MemColl<StoredProduct>();
		const productSlugHistory = new MemColl<StoredProductSlugHistory>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "old-slug",
			currentSlug: "old-slug",
			title: "History Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await updateProductHandler(
			catalogCtx(
				{
					productId: "prod_1",
					slug: "new-slug",
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productSlugHistory,
			),
		);

		expect(out.product.slug).toBe("new-slug");
		expect(out.product.currentSlug).toBe("new-slug");
		const historyItems = (await productSlugHistory.query({ where: { productId: "prod_1" } })).items;
		expect(historyItems).toHaveLength(1);
		expect(historyItems[0]?.data).toMatchObject({
			productId: "prod_1",
			slug: "old-slug",
			replacedBy: "new-slug",
		});

		const aliasDetail = await getStorefrontProductBySlugHandler(
			catalogCtx(
				{ slug: "old-slug" },
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productSlugHistory,
			),
		);
		expect(aliasDetail.wasSlugRedirected).toBe(true);
		expect(aliasDetail.canonicalSlug).toBe("new-slug");
		expect(aliasDetail.requestedSlug).toBe("old-slug");
	});

	it("rejects immutable product field updates", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "draft",
			visibility: "hidden",
			slug: "immutable",
			title: "Original",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = updateProductHandler(
			catalogCtx(
				{
					productId: "prod_1",
					type: "bundle",
				},
				products,
			),
		);
		await expect(out).rejects.toMatchObject({ code: "bad_request" });
	});

	it("rejects bundle discount fields on non-bundle product updates", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "simple",
			title: "Simple Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = updateProductHandler(
			catalogCtx({
				productId: "prod_1",
				bundleDiscountType: "fixed_amount",
				bundleDiscountValueMinor: 100,
			}, products),
		);
		await expect(out).rejects.toMatchObject({ code: "bad_request" });
	});

	it("sets product status transitions", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "draft",
			visibility: "hidden",
			slug: "stateful",
			title: "State",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const archived = await setProductStateHandler(
			catalogCtx(
				{
					productId: "prod_1",
					status: "archived",
				},
				products,
			),
		);
		expect(archived.product.status).toBe("archived");
		expect(archived.product.archivedAt).toBeTypeOf("string");

		const draft = await setProductStateHandler(
			catalogCtx(
				{
					productId: "prod_1",
					status: "draft",
				},
				products,
			),
		);
		expect(draft.product.status).toBe("draft");
		expect(draft.product.archivedAt).toBeUndefined();
	});

	it("lists products filtered by status and type", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("p1", {
			id: "p1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "alpha",
			title: "Alpha",
			shortDescription: "",
			longDescription: "",
			featured: true,
			sortOrder: 10,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("p2", {
			id: "p2",
			type: "simple",
			status: "draft",
			visibility: "hidden",
			slug: "beta",
			title: "Beta",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 5,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listProductsHandler(
			catalogCtx(
				{
					type: "simple",
					status: "active",
					visibility: undefined,
					limit: 20,
				},
				products,
			),
		);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]!.product.id).toBe("p1");
	});

	it("counts low-stock SKUs using COMMERCE_LIMITS.lowStockThreshold", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const threshold = COMMERCE_LIMITS.lowStockThreshold;
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "low-stock-product",
			title: "Low Stock Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_low", {
			id: "sku_low",
			productId: "prod_1",
			skuCode: "LOW",
			status: "active",
			unitPriceMinor: 1000,
			inventoryQuantity: threshold,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_safe", {
			id: "sku_safe",
			productId: "prod_1",
			skuCode: "SAFE",
			status: "active",
			unitPriceMinor: 1000,
			inventoryQuantity: threshold + 1,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listProductsHandler(
			catalogCtx(
				{
					type: "simple",
					visibility: "public",
					limit: 10,
				},
				products,
				skus,
			),
		);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]!.lowStockSkuCount).toBe(1);
	});

	it("uses inventory stock rows for list inventory summary calculations", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "low-stock-product",
			title: "Low Stock Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_low", {
			id: "sku_low",
			productId: "prod_1",
			skuCode: "LOW",
			status: "active",
			unitPriceMinor: 1000,
			inventoryQuantity: 100,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const listCtx = catalogCtx<ProductListInput>({ type: "simple", visibility: "public", limit: 10 }, products, skus);
		const inventoryStock = (listCtx.storage as unknown as { inventoryStock: MemColl<StoredInventoryStock> }).inventoryStock;
		await inventoryStock.put(inventoryStockDocId("prod_1", ""), {
			productId: "prod_1",
			variantId: "",
			version: 3,
			quantity: 0,
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listProductsHandler(listCtx);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]!.inventorySummary.totalInventoryQuantity).toBe(0);
		expect(out.items[0]!.lowStockSkuCount).toBe(1);
	});

	it("returns storefront list products with active/public defaults and safe payload", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "active-product",
			title: "Active Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_2", {
			id: "prod_2",
			type: "simple",
			status: "active",
			visibility: "hidden",
			slug: "hidden-product",
			title: "Hidden Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 1,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_3", {
			id: "prod_3",
			type: "simple",
			status: "draft",
			visibility: "public",
			slug: "draft-product",
			title: "Draft Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 2,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU1",
			status: "active",
			unitPriceMinor: 1000,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listStorefrontProductsHandler(
			catalogCtx(
				{
					type: "simple",
					limit: 10,
				},
				products,
				skus,
			),
		);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]).toMatchObject({
			product: { id: "prod_1", status: "active", visibility: "public" },
		});
		expect("inventorySummary" in out.items[0]!).toBe(false);
		expect("longDescription" in out.items[0]!.product).toBe(false);
	});

	it("locks down storefront list response contract keys", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "contract-product",
			title: "Contract Product",
			shortDescription: "",
			longDescription: "should not leak",
			brand: "Acme",
			vendor: "Acme",
			featured: false,
			sortOrder: 1,
			requiresShippingDefault: true,
			taxClassDefault: "zero",
			bundleDiscountType: "none",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU1",
			status: "active",
			unitPriceMinor: 999,
			inventoryQuantity: 22,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listStorefrontProductsHandler(
			catalogCtx(
				{
					type: "simple",
					limit: 10,
				},
				products,
				skus,
			),
		);

		expect(Object.keys(out).toSorted()).toEqual(["items"]);
		expect(Object.keys(out.items[0]!).toSorted()).toEqual(CATALOG_STOREFRONT_LIST_ITEM_KEYS.toSorted());
		expect(Object.keys(out.items[0]!.product).toSorted()).toEqual(
			CATALOG_STOREFRONT_LIST_ITEM_PRODUCT_KEYS.toSorted(),
		);
		expect("longDescription" in out.items[0]!.product).toBe(false);
	});

	it("requires POST for storefront list APIs", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "post-only-list",
			title: "POST Only",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await expect(
			listStorefrontProductsHandler(
				catalogCtxWithMethod(
					catalogCtx(
						{
							type: "simple",
							limit: 10,
						},
						products,
					),
					"GET",
				),
			),
		).rejects.toThrow("Only POST is allowed");
		await expect(
			listStorefrontProductSkusHandler(
				catalogCtxWithMethod(
					catalogCtx({ productId: "prod_1", limit: 10 }, products, new MemColl()),
					"GET",
				),
			),
		).rejects.toThrow("Only POST is allowed");
		await expect(
			getStorefrontProductHandler(
				catalogCtxWithMethod(catalogCtx({ productId: "prod_1" }, products, new MemColl()), "GET"),
			),
		).rejects.toThrow("Only POST is allowed");
	});

	it("requires POST for storefront product lookup and SKU write operations", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "slug-route",
			title: "Slug Route",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU-1",
			status: "active",
			unitPriceMinor: 100,
			inventoryQuantity: 20,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const readCtxBySlug = catalogCtx({ slug: "slug-route" }, products, skus);
		await expect(
			getStorefrontProductBySlugHandler(catalogCtxWithMethod(readCtxBySlug, "GET")),
		).rejects.toThrow("Only POST is allowed");
		await expect(
			listStorefrontProductSkusHandler(catalogCtxWithMethod(catalogCtx({ productId: "prod_1", limit: 10 }, products, skus), "GET")),
		).rejects.toThrow("Only POST is allowed");
		await expect(
			createProductHandler(catalogCtxWithMethod(catalogCtx({ type: "simple", status: "draft", slug: "write-probe", title: "Write Probe" }, products, skus), "GET")),
		).rejects.toThrow("Only POST is allowed");
		await expect(
			setSkuStatusHandler(
				catalogCtxWithMethod(catalogCtx({ skuId: "sku_1", status: "inactive" }, products, skus), "GET"),
			),
		).rejects.toThrow("Only POST is allowed");
	});

	it("requires POST for storefront bundle compute", async () => {
		const products = new MemColl<StoredProduct>();
		const bundleInput = { productId: "bundle_hidden" };

		await expect(
			bundleComputeStorefrontHandler(
				catalogCtxWithMethod(catalogCtx(bundleInput, products), "GET"),
			),
		).rejects.toThrow("Only POST is allowed");
	});

	it("returns storefront product detail without raw inventory fields", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "safe-product",
			title: "Safe Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU1",
			status: "active",
			unitPriceMinor: 500,
			inventoryQuantity: 100,
			inventoryVersion: 4,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const detail = await getStorefrontProductHandler(catalogCtx({ productId: "prod_1" }, products, skus));
		expect(detail.product).toMatchObject({ id: "prod_1", title: "Safe Product" });
		expect("longDescription" in detail.product).toBe(false);
		expect(detail.skus?.[0]).toMatchObject({ id: "sku_1", availability: "in_stock" });
		expect("inventoryQuantity" in (detail.skus![0] as object)).toBe(false);
		expect("inventoryVersion" in (detail.skus![0] as object)).toBe(false);
	});

	it("keeps admin product detail/sku payloads internal while storefront hides inventory internals", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "safe-product",
			title: "Safe Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU1",
			status: "active",
			unitPriceMinor: 500,
			inventoryQuantity: 100,
			inventoryVersion: 4,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const adminDetail = await getProductHandler(catalogCtx({ productId: "prod_1" }, products, skus));
		const storefrontDetail = await getStorefrontProductHandler(catalogCtx({ productId: "prod_1" }, products, skus));
		expect(adminDetail.skus?.[0]).toMatchObject({
			id: "sku_1",
			inventoryQuantity: 100,
			inventoryVersion: 4,
		});
		expect("inventoryQuantity" in (storefrontDetail.skus![0] as object)).toBe(false);
		expect("inventoryVersion" in (storefrontDetail.skus![0] as object)).toBe(false);

		const adminSkuList = await listProductSkusHandler(catalogCtx({ productId: "prod_1", limit: 10 }, products, skus));
		const storefrontSkuList = await listStorefrontProductSkusHandler(catalogCtx({ productId: "prod_1", limit: 10 }, products, skus));
		expect(adminSkuList.items[0]).toMatchObject({
			id: "sku_1",
			inventoryQuantity: 100,
			inventoryVersion: 4,
		});
		expect("inventoryQuantity" in (storefrontSkuList.items[0] as object)).toBe(false);
		expect("inventoryVersion" in (storefrontSkuList.items[0] as object)).toBe(false);
	});

	it("locks down admin product detail response contract keys", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_admin", {
			id: "prod_admin",
			type: "simple",
			status: "draft",
			visibility: "hidden",
			slug: "admin-contract-product",
			currentSlug: "admin-contract-product",
			title: "Admin Contract Product",
			shortDescription: "for schema lock-down tests",
			longDescription: "administrative metadata should stay admin-only",
			brand: "Acme",
			vendor: "Acme Co",
			featured: true,
			sortOrder: 3,
			requiresShippingDefault: false,
			taxClassDefault: "standard",
			bundleDiscountType: "fixed_amount",
			bundleDiscountValueMinor: 250,
			bundleDiscountValueBps: 1250,
			metadataJson: { launchRegion: "internal" },
			createdAt: "2026-01-02T00:00:00.000Z",
			updatedAt: "2026-01-02T00:00:00.000Z",
		});
		await skus.put("sku_admin", {
			id: "sku_admin",
			productId: "prod_admin",
			skuCode: "ADM-1",
			status: "active",
			unitPriceMinor: 2100,
			inventoryQuantity: 7,
			inventoryVersion: 3,
			requiresShipping: false,
			isDigital: false,
			createdAt: "2026-01-02T00:00:00.000Z",
			updatedAt: "2026-01-02T00:00:00.000Z",
		});

		const adminDetail = await getProductHandler(catalogCtx({ productId: "prod_admin" }, products, skus));
		expect(Object.keys(adminDetail).toSorted()).toEqual(CATALOG_ADMIN_PRODUCT_KEYS.toSorted());
		expect(Object.keys(adminDetail.product).toSorted()).toEqual(
			CATALOG_ADMIN_PRODUCT_PRODUCT_KEYS.toSorted(),
		);
		expect(adminDetail.product.longDescription).toBe("administrative metadata should stay admin-only");
		expect(adminDetail.skus?.[0]).toMatchObject({
			inventoryQuantity: 7,
			inventoryVersion: 3,
		});
	});

	it("resolves storefront products via slug with canonical hint", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "summer-tee",
			currentSlug: "summer-tee",
			title: "Summer Tee",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SUMMER-SKU",
			status: "active",
			unitPriceMinor: 500,
			inventoryQuantity: 10,
			inventoryVersion: 2,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const detail = await getStorefrontProductBySlugHandler(
			catalogCtx(
				{ slug: "summer-tee" },
				products,
				skus,
			),
		);
		expect(detail.product.id).toBe("prod_1");
		expect(detail.requestedSlug).toBe("summer-tee");
		expect(detail.canonicalSlug).toBe("summer-tee");
		expect(detail.wasSlugRedirected).toBe(false);
	});

	it("returns canonical slug hint for legacy slug redirects", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productSlugHistory = new MemColl<StoredProductSlugHistory>();

		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "summer-tee",
			currentSlug: "summer-tee",
			title: "Summer Tee",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SUMMER-SKU",
			status: "active",
			unitPriceMinor: 500,
			inventoryQuantity: 10,
			inventoryVersion: 2,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productSlugHistory.put("slug_legacy", {
			productId: "prod_1",
			slug: "summer-tee-2024",
			replacedBy: "summer-tee",
			createdAt: "2026-01-01T00:00:00.000Z",
		});

		const detail = await getStorefrontProductBySlugHandler(
			catalogCtx(
				{ slug: "summer-tee-2024" },
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productSlugHistory,
			),
		);
		expect(detail.product.id).toBe("prod_1");
		expect(detail.requestedSlug).toBe("summer-tee-2024");
		expect(detail.canonicalSlug).toBe("summer-tee");
		expect(detail.wasSlugRedirected).toBe(true);
	});

	it("hides inactive SKUs from storefront product detail payloads", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();
		await products.put("prod_var", {
			id: "prod_var",
			type: "variable",
			status: "active",
			visibility: "public",
			slug: "variable-product",
			title: "Variable Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_active", {
			id: "sku_active",
			productId: "prod_var",
			skuCode: "VAR-A",
			status: "active",
			unitPriceMinor: 1200,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_inactive", {
			id: "sku_inactive",
			productId: "prod_var",
			skuCode: "VAR-I",
			status: "inactive",
			unitPriceMinor: 1300,
			inventoryQuantity: 99,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productSkuOptionValues.put("opt_active", {
			id: "opt_active",
			skuId: "sku_active",
			attributeId: "attr_size",
			attributeValueId: "size_s",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productSkuOptionValues.put("opt_inactive", {
			id: "opt_inactive",
			skuId: "sku_inactive",
			attributeId: "attr_size",
			attributeValueId: "size_m",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const detail = await getStorefrontProductHandler(
			catalogCtx(
				{ productId: "prod_var" },
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productSkuOptionValues,
			),
		);
		expect(detail.skus).toHaveLength(1);
		expect(detail.skus?.[0]).toMatchObject({ id: "sku_active", status: "active", availability: "in_stock" });
		expect(detail.variantMatrix).toHaveLength(1);
		expect(detail.variantMatrix?.[0]).toMatchObject({ skuId: "sku_active", status: "active" });
		expect("inventoryQuantity" in (detail.variantMatrix![0] as object)).toBe(false);
	});

	it("computes storefront list availability from active SKUs only", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "availability-product",
			title: "Availability Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_active", {
			id: "sku_active",
			productId: "prod_1",
			skuCode: "ACTIVE",
			status: "active",
			unitPriceMinor: 500,
			inventoryQuantity: 0,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_inactive", {
			id: "sku_inactive",
			productId: "prod_1",
			skuCode: "INACTIVE",
			status: "inactive",
			unitPriceMinor: 500,
			inventoryQuantity: 50,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listStorefrontProductsHandler(
			catalogCtx(
				{
					type: "simple",
					limit: 10,
				},
				products,
				skus,
			),
		);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]).toMatchObject({
			product: { id: "prod_1" },
			availability: "out_of_stock",
		});
	});

	it("hides storefront product detail for non-public products", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_hidden", {
			id: "prod_hidden",
			type: "simple",
			status: "active",
			visibility: "hidden",
			slug: "hidden-product",
			title: "Hidden Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_hidden", {
			id: "sku_hidden",
			productId: "prod_hidden",
			skuCode: "HID",
			status: "active",
			unitPriceMinor: 100,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await expect(getStorefrontProductHandler(catalogCtx({ productId: "prod_hidden" }, products, skus))).rejects.toThrow("Product not available");
	});

	it("returns storefront sku list without raw inventory fields", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "stock-product",
			title: "Stock Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU1",
			status: "active",
			unitPriceMinor: 500,
			inventoryQuantity: 100,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_2", {
			id: "sku_2",
			productId: "prod_1",
			skuCode: "SKU2",
			status: "inactive",
			unitPriceMinor: 600,
			inventoryQuantity: 0,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listStorefrontProductSkusHandler(
			catalogCtx({ productId: "prod_1", limit: 10 }, products, skus),
		);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]).toMatchObject({ id: "sku_1", availability: "in_stock" });
		expect("inventoryQuantity" in (out.items[0] as object)).toBe(false);
		expect("inventoryVersion" in (out.items[0] as object)).toBe(false);
	});

	it("uses stock snapshot values when listing storefront SKUs", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const inventoryStock = new MemColl<StoredInventoryStock>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "stock-snapshot-product",
			title: "Stock Snapshot Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU1",
			status: "active",
			unitPriceMinor: 1200,
			inventoryQuantity: 0,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await inventoryStock.put(inventoryStockDocId("prod_1", ""), {
			productId: "prod_1",
			variantId: "",
			quantity: 10,
			version: 3,
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const listCtx = catalogCtxWithInventoryStock(
			{ productId: "prod_1", limit: 10 },
			products,
			skus,
			inventoryStock,
		);
		expect(
			await (listCtx.storage as { inventoryStock: MemColl<StoredInventoryStock> }).inventoryStock.get(inventoryStockDocId("prod_1", "")),
		).toMatchObject({
			productId: "prod_1",
			variantId: "",
			quantity: 10,
			version: 3,
		});
		const out = await listStorefrontProductSkusHandler(listCtx);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]).toMatchObject({ id: "sku_1", availability: "in_stock" });
	});

	it("preserves storefront SKU order after filtering when listing", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const inventoryStock = new MemColl<StoredInventoryStock>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "ordered-product",
			title: "Ordered Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_inactive", {
			id: "sku_inactive",
			productId: "prod_1",
			skuCode: "INACTIVE",
			status: "inactive",
			unitPriceMinor: 100,
			inventoryQuantity: 0,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_active_first", {
			id: "sku_active_first",
			productId: "prod_1",
			skuCode: "ACTIVE_ONE",
			status: "active",
			unitPriceMinor: 200,
			inventoryQuantity: 0,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_active_second", {
			id: "sku_active_second",
			productId: "prod_1",
			skuCode: "ACTIVE_TWO",
			status: "active",
			unitPriceMinor: 250,
			inventoryQuantity: 0,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_inactive_late", {
			id: "sku_inactive_late",
			productId: "prod_1",
			skuCode: "INACTIVE_TWO",
			status: "inactive",
			unitPriceMinor: 150,
			inventoryQuantity: 0,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await inventoryStock.put(inventoryStockDocId("prod_1", "sku_active_first"), {
			productId: "prod_1",
			variantId: "sku_active_first",
			quantity: 0,
			version: 4,
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await inventoryStock.put(inventoryStockDocId("prod_1", "sku_active_second"), {
			productId: "prod_1",
			variantId: "sku_active_second",
			quantity: 7,
			version: 6,
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const listCtx = catalogCtxWithInventoryStock(
			{ productId: "prod_1", limit: 2 },
			products,
			skus,
			inventoryStock,
		);
		const listStorage = listCtx.storage as { inventoryStock: MemColl<StoredInventoryStock> };
		expect(await listStorage.inventoryStock.get(inventoryStockDocId("prod_1", "sku_active_first"))).toMatchObject({
			quantity: 0,
			variantId: "sku_active_first",
		});
		expect(await listStorage.inventoryStock.get(inventoryStockDocId("prod_1", "sku_active_second"))).toMatchObject({
			quantity: 7,
			variantId: "sku_active_second",
		});
		const out = await listStorefrontProductSkusHandler(listCtx);
		expect(out.items).toHaveLength(2);
		expect(out.items[0]).toMatchObject({ id: "sku_active_first", availability: "out_of_stock" });
		expect(out.items[1]).toMatchObject({ id: "sku_active_second", availability: "in_stock" });
	});

	it("applies storefront SKU filtering before pagination limits", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "pagination-product",
			title: "Pagination Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_inactive", {
			id: "sku_inactive",
			productId: "prod_1",
			skuCode: "INACTIVE",
			status: "inactive",
			unitPriceMinor: 100,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_active", {
			id: "sku_active",
			productId: "prod_1",
			skuCode: "ACTIVE",
			status: "active",
			unitPriceMinor: 200,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await listStorefrontProductSkusHandler(
			catalogCtx(
				{
					productId: "prod_1",
					limit: 1,
				},
				products,
				skus,
			),
		);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]).toMatchObject({ id: "sku_active", status: "active" });
	});

	it("hides storefront SKU lists for non-public products", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_hidden", {
			id: "prod_hidden",
			type: "simple",
			status: "active",
			visibility: "hidden",
			slug: "hidden-product",
			title: "Hidden Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_hidden", {
			id: "sku_hidden",
			productId: "prod_hidden",
			skuCode: "HID",
			status: "active",
			unitPriceMinor: 100,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await expect(
			listStorefrontProductSkusHandler(
				catalogCtx({ productId: "prod_hidden", limit: 10 }, products, skus),
			),
		).rejects.toThrow("Product not available");
	});

	it("reads simple product SKU inventory from inventoryStock in product detail", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "stock-product",
			title: "Stock Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "STOCK",
			status: "active",
			unitPriceMinor: 500,
			inventoryQuantity: 100,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const getCtx = catalogCtx({ productId: "prod_1" }, products, skus);
		const inventoryStock = (getCtx.storage as unknown as { inventoryStock: MemColl<StoredInventoryStock> }).inventoryStock;
		await inventoryStock.put(inventoryStockDocId("prod_1", "sku_1"), {
			productId: "prod_1",
			variantId: "sku_1",
			version: 6,
			quantity: 6,
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const detail = await getProductHandler(getCtx);
		expect(detail.skus?.[0]).toMatchObject({ id: "sku_1", inventoryQuantity: 6, inventoryVersion: 6 });
	});

	it("falls back to product-level inventory stock when a simple SKU stock row is missing", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const createCtx = catalogCtx<ProductSkuCreateInput>(
			{
				productId: "prod_1",
				skuCode: "STOCK",
				status: "active",
				unitPriceMinor: 500,
				inventoryQuantity: 6,
				inventoryVersion: 1,
				requiresShipping: true,
				isDigital: false,
			},
			products,
			skus,
		);
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "stock-product",
			title: "Stock Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const created = await createProductSkuHandler(createCtx);
		const inventoryStock = (createCtx.storage as unknown as { inventoryStock: MemColl<StoredInventoryStock> }).inventoryStock;
		await inventoryStock.delete(inventoryStockDocId(created.sku.productId, created.sku.id));

		const readCtx = { ...createCtx, input: { productId: "prod_1" } } as unknown as RouteContext<{
			productId: string;
		}>;
		const detail = await getProductHandler(readCtx);
		expect(detail.skus?.[0]).toMatchObject({
			id: created.sku.id,
			inventoryQuantity: created.sku.inventoryQuantity,
			inventoryVersion: 1,
		});
		expect(await inventoryStock.get(inventoryStockDocId("prod_1", ""))).toMatchObject({
			productId: "prod_1",
			variantId: "",
			quantity: created.sku.inventoryQuantity,
			version: 1,
		});
	});

	it("returns the same category/tag/image metadata from product detail and listing", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productAssets = new MemColl<StoredProductAsset>();
		const productAssetLinks = new MemColl<StoredProductAssetLink>();
		const productCategories = new MemColl<StoredCategory>();
		const productCategoryLinks = new MemColl<StoredProductCategoryLink>();
		const productTags = new MemColl<StoredProductTag>();
		const productTagLinks = new MemColl<StoredProductTagLink>();

		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "seeded-product",
			title: "Seeded Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "INV-1",
			status: "active",
			unitPriceMinor: 1200,
			inventoryQuantity: 4,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await productCategories.put("cat_1", {
			id: "cat_1",
			name: "Featured",
			slug: "featured",
			parentId: undefined,
			position: 0,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productCategoryLinks.put("pcat_1", {
			id: "pcat_1",
			productId: "prod_1",
			categoryId: "cat_1",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await productTags.put("tag_1", {
			id: "tag_1",
			name: "Sale",
			slug: "sale",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productTagLinks.put("ptag_1", {
			id: "ptag_1",
			productId: "prod_1",
			tagId: "tag_1",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await productAssets.put("asset_primary", {
			id: "asset_primary",
			provider: "media",
			externalAssetId: "media-primary",
			fileName: "primary.jpg",
			altText: "Primary image",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAssets.put("asset_gallery", {
			id: "asset_gallery",
			provider: "media",
			externalAssetId: "media-gallery",
			fileName: "gallery.jpg",
			altText: "Gallery image",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_primary",
					targetType: "product",
					targetId: "prod_1",
					role: "primary_image",
					position: 0,
				},
				products,
				skus,
				productAssets,
				productAssetLinks,
			),
		);
		await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_gallery",
					targetType: "product",
					targetId: "prod_1",
					role: "gallery_image",
					position: 0,
				},
				products,
				skus,
				productAssets,
				productAssetLinks,
			),
		);

		const detail = await getProductHandler(
			catalogCtx(
				{ productId: "prod_1" },
				products,
				skus,
				productAssets,
				productAssetLinks,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productCategories,
				productCategoryLinks,
				productTags,
				productTagLinks,
			),
		);

		const list = await listProductsHandler(
			catalogCtx(
				{
					type: "simple",
					status: "active",
					visibility: "public",
					limit: 10,
				},
				products,
				skus,
				productAssets,
				productAssetLinks,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productCategories,
				productCategoryLinks,
				productTags,
				productTagLinks,
			),
		);

		expect(list.items).toHaveLength(1);
		const listed = list.items[0]!;
		expect(listed.product.id).toBe("prod_1");
		expect(listed.categories).toEqual(detail.categories);
		expect(listed.tags).toEqual(detail.tags);
		expect(listed.primaryImage).toEqual(detail.primaryImage);
		expect(listed.galleryImages).toEqual(detail.galleryImages);
		expect(listed.inventorySummary.totalInventoryQuantity).toBe(detail.skus?.[0]?.inventoryQuantity);
		expect(listed.lowStockSkuCount).toBe(
			detail.skus?.filter((sku) => sku.status === "active" && sku.inventoryQuantity <= COMMERCE_LIMITS.lowStockThreshold).length ?? 0,
		);
	});

	it("returns product_unavailable when productId does not exist", async () => {
		const out = getProductHandler(catalogCtx({ productId: "missing" }, new MemColl()));
		await expect(out).rejects.toMatchObject({ code: "product_unavailable" });
	});

	it("returns entitlement summaries in product detail view", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const digitalAssets = new MemColl<StoredDigitalAsset>();
		const digitalEntitlements = new MemColl<StoredDigitalEntitlement>();

		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "digital-product",
			title: "Digital Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "DIGI",
			status: "active",
			unitPriceMinor: 199,
			inventoryQuantity: 100,
			inventoryVersion: 1,
			requiresShipping: false,
			isDigital: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const asset = await createDigitalAssetHandler(
			catalogCtx<DigitalAssetCreateInput>(
				{
					externalAssetId: "media-101",
					provider: "media",
					label: "Product Manual",
					downloadLimit: 1,
					downloadExpiryDays: 30,
					isManualOnly: true,
					isPrivate: true,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				digitalAssets,
				digitalEntitlements,
			),
		);

		await createDigitalEntitlementHandler(
			catalogCtx<DigitalEntitlementCreateInput>(
				{
					skuId: "sku_1",
					digitalAssetId: asset.asset.id,
					grantedQuantity: 2,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				digitalAssets,
				digitalEntitlements,
			),
		);

		const out = await getProductHandler(
			catalogCtx(
				{ productId: "prod_1" },
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				digitalAssets,
				digitalEntitlements,
			),
		);

		expect(out.digitalEntitlements).toEqual([
			{
				skuId: "sku_1",
				entitlements: [
					{
						entitlementId: expect.any(String),
						digitalAssetId: asset.asset.id,
						digitalAssetLabel: "Product Manual",
						grantedQuantity: 2,
						downloadLimit: 1,
						downloadExpiryDays: 30,
						isManualOnly: true,
						isPrivate: true,
					},
				],
			},
		]);
	});
});

describe("catalog SKU handlers", () => {
	it("creates SKU rows and lists them by productId", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const createSkuCtx = catalogCtx<ProductSkuCreateInput>(
			{
				productId: "parent",
				skuCode: "SIMPLE-A",
				status: "active",
				unitPriceMinor: 1299,
				inventoryQuantity: 10,
				inventoryVersion: 1,
				requiresShipping: true,
				isDigital: false,
			},
			products,
			skus,
		);
		const created = await createProductSkuHandler(createSkuCtx);
		expect(created.sku.skuCode).toBe("SIMPLE-A");
		expect(created.sku.id).toMatch(SKU_ID_PREFIX);

		const listCtx = catalogCtx({ productId: "parent", limit: 10 }, products, skus);
		const listed = await listProductSkusHandler(listCtx);
		expect(listed.items).toHaveLength(1);
		expect(listed.items[0]!.id).toBe(created.sku.id);
	});

	it("rejects creating more than one SKU for simple products", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: "parent",
					skuCode: "SIMPLE-A",
					status: "active",
					unitPriceMinor: 1299,
					inventoryQuantity: 10,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
				},
				products,
				skus,
			),
		);

		const second = createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: "parent",
					skuCode: "SIMPLE-B",
					status: "active",
					unitPriceMinor: 1299,
					inventoryQuantity: 5,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
				},
				products,
				skus,
			),
		);

		await expect(second).rejects.toMatchObject({ code: "bad_request" });
		expect(skus.rows.size).toBe(1);
	});

	it("stores variant option mappings and returns a variable matrix on get", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();

		const product = await createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "active",
					visibility: "public",
					slug: "variable-shirt",
					title: "Variable Shirt",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [
								{ value: "Red", code: "red", position: 0 },
								{ value: "Blue", code: "blue", position: 1 },
							],
						},
						{
							name: "Size",
							code: "size",
							kind: "variant_defining",
							position: 1,
							values: [
								{ value: "Small", code: "s", position: 0 },
								{ value: "Large", code: "l", position: 1 },
							],
						},
					],
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
			),
		);

		const colorAttribute = [...productAttributes.rows.values()].find((attribute) => attribute.code === "color");
		expect(colorAttribute).toBeDefined();
		const sizeAttribute = [...productAttributes.rows.values()].find((attribute) => attribute.code === "size");
		expect(sizeAttribute).toBeDefined();
		const valueByCode = new Map(Array.from(productAttributeValues.rows.values(), (row) => [row.code, row.id]));

		const skuA = await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "VSHIRT-RS",
					status: "active",
					unitPriceMinor: 2100,
					inventoryQuantity: 15,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [
						{
							attributeId: colorAttribute!.id,
							attributeValueId: valueByCode.get("red")!,
						},
						{
							attributeId: sizeAttribute!.id,
							attributeValueId: valueByCode.get("s")!,
						},
					],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		const skuB = await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "VSHIRT-BL",
					status: "active",
					unitPriceMinor: 2200,
					inventoryQuantity: 10,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [
						{
							attributeId: colorAttribute!.id,
							attributeValueId: valueByCode.get("blue")!,
						},
						{
							attributeId: sizeAttribute!.id,
							attributeValueId: valueByCode.get("l")!,
						},
					],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		expect(skuA.sku.skuCode).toBe("VSHIRT-RS");
		expect(skuB.sku.skuCode).toBe("VSHIRT-BL");
		expect(productSkuOptionValues.rows.size).toBe(4);

		const detail = await getProductHandler(
			catalogCtx(
				{ productId: product.product.id },
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);
		expect(detail.attributes).toHaveLength(2);
		expect(detail.variantMatrix).toHaveLength(2);
		expect(detail.variantMatrix?.every((row) => row.options.length === 2)).toBe(true);
	});

	it("creates matching inventoryStock rows when creating a simple SKU", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const createCtx = catalogCtx<ProductSkuCreateInput>(
			{
				productId: "parent",
				skuCode: "SIMPLE-STOCK",
				status: "active",
				unitPriceMinor: 1299,
				inventoryQuantity: 12,
				inventoryVersion: 1,
				requiresShipping: true,
				isDigital: false,
			},
			products,
			skus,
		);
		const created = await createProductSkuHandler(createCtx);
		const inventoryStock = (createCtx.storage as unknown as { inventoryStock: MemColl<StoredInventoryStock> }).inventoryStock;

		const variantStock = await inventoryStock.get(inventoryStockDocId(created.sku.productId, created.sku.id));
		const productStock = await inventoryStock.get(inventoryStockDocId(created.sku.productId, ""));
		expect(inventoryStock.rows.size).toBe(2);
		expect(variantStock).toMatchObject({
			productId: "parent",
			variantId: created.sku.id,
			quantity: 12,
			version: 1,
		});
		expect(productStock).toMatchObject({
			productId: "parent",
			variantId: "",
			quantity: 12,
			version: 1,
		});
	});

	it("updates matching inventoryStock rows when SKU inventory fields change", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const inventoryStock = new MemColl<StoredInventoryStock>();
		const productSkuCtx = (input: ProductSkuCreateInput | ProductSkuUpdateInput) =>
			catalogCtx(
				input as Parameters<typeof catalogCtx>[0],
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				inventoryStock,
			);

		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		const created = await createProductSkuHandler(
			productSkuCtx({
				productId: "parent",
				skuCode: "SIMPLE-STOCK",
				status: "active",
				unitPriceMinor: 1299,
				inventoryQuantity: 12,
				inventoryVersion: 1,
				requiresShipping: true,
				isDigital: false,
			}) as Parameters<typeof createProductSkuHandler>[0],
		);

		await updateProductSkuHandler(
			productSkuCtx({
				skuId: created.sku.id,
				inventoryQuantity: 3,
				inventoryVersion: 4,
			}) as Parameters<typeof updateProductSkuHandler>[0],
		);

		const variantStock = await inventoryStock.get(inventoryStockDocId(created.sku.productId, created.sku.id));
		const productStock = await inventoryStock.get(inventoryStockDocId(created.sku.productId, ""));
		expect(variantStock).toMatchObject({
			productId: "parent",
			variantId: created.sku.id,
			quantity: 3,
			version: 4,
		});
		expect(productStock).toMatchObject({
			productId: "parent",
			variantId: "",
			quantity: 3,
			version: 4,
		});
	});

	it("creates only variant-level inventoryStock for variable SKUs", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();

		const product = await createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "active",
					visibility: "public",
					slug: "variable-stock-product",
					title: "Variable stock product",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [{ value: "Red", code: "red", position: 0 }],
						},
					],
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
			),
		);
		const colorAttribute = [...productAttributes.rows.values()].find((attribute) => attribute.productId === product.product.id);
		const colorValue = [...productAttributeValues.rows.values()].find((value) => value.attributeId === colorAttribute!.id);
		const createCtx = catalogCtx<ProductSkuCreateInput>(
			{
				productId: product.product.id,
				skuCode: "VAR-1",
				status: "active",
				unitPriceMinor: 1099,
				inventoryQuantity: 7,
				inventoryVersion: 1,
				requiresShipping: true,
				isDigital: false,
				optionValues: [{ attributeId: colorAttribute!.id, attributeValueId: colorValue!.id }],
			},
			products,
			skus,
			new MemColl(),
			new MemColl(),
			productAttributes,
			productAttributeValues,
			productSkuOptionValues,
		);
		const created = await createProductSkuHandler(createCtx);
		const inventoryStock = (createCtx.storage as unknown as { inventoryStock: MemColl<StoredInventoryStock> }).inventoryStock;

		const variantStock = await inventoryStock.get(inventoryStockDocId(created.sku.productId, created.sku.id));
		const productLevelStock = await inventoryStock.get(inventoryStockDocId(created.sku.productId, ""));
		expect(inventoryStock.rows.size).toBe(1);
		expect(variantStock).toMatchObject({
			productId: product.product.id,
			variantId: created.sku.id,
			quantity: 7,
			version: 1,
		});
		expect(productLevelStock).toBeNull();
	});

	it("rejects variable SKU creation when option coverage is incomplete", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();

		const product = await createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "active",
					visibility: "public",
					slug: "incomplete-variable",
					title: "Incomplete variable",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [
								{ value: "Red", code: "red", position: 0 },
								{ value: "Blue", code: "blue", position: 1 },
							],
						},
						{
							name: "Size",
							code: "size",
							kind: "variant_defining",
							position: 1,
							values: [{ value: "Small", code: "s", position: 0 }],
						},
					],
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
			),
		);

		const missing = createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "MISS-1",
					status: "active",
					unitPriceMinor: 1000,
					inventoryQuantity: 1,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [
						{
							attributeId: [...productAttributes.rows.values()][0]!.id,
							attributeValueId: [...productAttributeValues.rows.values()][0]!.id,
						},
					],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);
		await expect(missing).rejects.toMatchObject({ code: "bad_request" });
	});

	it("rejects option mappings on non-variable products", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "simple-parent",
			title: "Simple Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: "parent",
					skuCode: "BAD-MAP",
					status: "active",
					unitPriceMinor: 1000,
					inventoryQuantity: 1,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [{ attributeId: "attr_1", attributeValueId: "val_1" }],
				},
				products,
				skus,
			),
		);

		await expect(out).rejects.toMatchObject({ code: "bad_request" });
	});

	it("rejects duplicate and duplicate-combination SKU option mappings for variable products", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new MemColl<StoredProductSkuOptionValue>();

		const product = await createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "active",
					visibility: "public",
					slug: "combo-variable",
					title: "Combo variable",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [{ value: "Red", code: "red", position: 0 }],
						},
					],
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
			),
		);

		const colorAttribute = [...productAttributes.rows.values()][0]!;
		const colorValue = [...productAttributeValues.rows.values()][0]!;

		const duplicateAttributeValue = createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "DUP-1",
					status: "active",
					unitPriceMinor: 1000,
					inventoryQuantity: 1,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [
						{ attributeId: colorAttribute.id, attributeValueId: colorValue.id },
						{ attributeId: colorAttribute.id, attributeValueId: colorValue.id },
					],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);
		await expect(duplicateAttributeValue).rejects.toMatchObject({ code: "bad_request" });

		await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "V1",
					status: "active",
					unitPriceMinor: 1100,
					inventoryQuantity: 2,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [{ attributeId: colorAttribute.id, attributeValueId: colorValue.id }],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		const duplicateCombination = createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "V2",
					status: "active",
					unitPriceMinor: 1150,
					inventoryQuantity: 2,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [{ attributeId: colorAttribute.id, attributeValueId: colorValue.id }],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);
		await expect(duplicateCombination).rejects.toMatchObject({ code: "bad_request" });
	});

	it("batches variable SKU validation reads for better scalability", async () => {
		const products = new QueryCountingMemColl<StoredProduct>();
		const skus = new (class extends QueryCountingMemColl<StoredProductSku> {
			async putIfAbsent(id: string, data: StoredProductSku): Promise<boolean> {
				await this.put(id, data);
				return true;
			}
		})();
		const productAttributes = new QueryCountingMemColl<StoredProductAttribute>();
		const productAttributeValues = new QueryCountingMemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new QueryCountingMemColl<StoredProductSkuOptionValue>();

		const product = await createProductHandler(
			catalogCtx<ProductCreateInput>(
				{
					type: "variable",
					status: "active",
					visibility: "public",
					slug: "scalable-variable",
					title: "Scalable variable",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
					attributes: [
						{
							name: "Color",
							code: "color",
							kind: "variant_defining",
							position: 0,
							values: [
								{ value: "Red", code: "red", position: 0 },
								{ value: "Blue", code: "blue", position: 1 },
							],
						},
						{
							name: "Size",
							code: "size",
							kind: "variant_defining",
							position: 1,
							values: [
								{ value: "Small", code: "s", position: 0 },
								{ value: "Large", code: "l", position: 1 },
							],
						},
					],
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
			),
		);

		const colorAttribute = [...productAttributes.rows.values()].find((attribute) => attribute.code === "color");
		const sizeAttribute = [...productAttributes.rows.values()].find((attribute) => attribute.code === "size");
		const colorValues = [...productAttributeValues.rows.values()].filter((value) =>
			value.attributeId === colorAttribute?.id,
		);
		const sizeValues = [...productAttributeValues.rows.values()].filter((value) => value.attributeId === sizeAttribute?.id);
		if (!colorAttribute || !sizeAttribute || colorValues.length < 2 || sizeValues.length < 2) {
			throw new Error("Test fixture missing required attributes");
		}

		await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "V-ONE",
					status: "active",
					unitPriceMinor: 1100,
					inventoryQuantity: 5,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [
						{ attributeId: colorAttribute.id, attributeValueId: colorValues[0]!.id },
						{ attributeId: sizeAttribute.id, attributeValueId: sizeValues[0]!.id },
					],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "V-TWO",
					status: "active",
					unitPriceMinor: 1200,
					inventoryQuantity: 5,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [
						{ attributeId: colorAttribute.id, attributeValueId: colorValues[1]!.id },
						{ attributeId: sizeAttribute.id, attributeValueId: sizeValues[1]!.id },
					],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		products.queryCount = 0;
		skus.queryCount = 0;
		productAttributes.queryCount = 0;
		productAttributeValues.queryCount = 0;
		productSkuOptionValues.queryCount = 0;

		await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "V-THREE",
					status: "active",
					unitPriceMinor: 1300,
					inventoryQuantity: 5,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [
						{ attributeId: colorAttribute.id, attributeValueId: colorValues[0]!.id },
						{ attributeId: sizeAttribute.id, attributeValueId: sizeValues[1]!.id },
					],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);

		expect(skus.queryCount).toBe(2);
		expect(productAttributes.queryCount).toBe(1);
		expect(productAttributeValues.queryCount).toBe(1);
		expect(productSkuOptionValues.queryCount).toBe(1);
	});

	it("rejects duplicate variable SKU combinations that appear on paginated read pages", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new PagedQueryMemColl<StoredProductSku>();
		const productAttributes = new MemColl<StoredProductAttribute>();
		const productAttributeValues = new MemColl<StoredProductAttributeValue>();
		const productSkuOptionValues = new PagedQueryMemColl<StoredProductSkuOptionValue>();
		const batchValues = Array.from({ length: 101 }, (_, index) => ({
			value: `Option ${index}`,
			code: `option_${index}`,
			position: index,
		}));

		const product = await createProductHandler(
			catalogCtx<ProductCreateInput>({
				type: "variable",
				status: "active",
				visibility: "public",
				slug: "scalable-variable-duplicate",
				title: "Scalable variable with duplicate on later page",
				shortDescription: "",
				longDescription: "",
				featured: false,
				sortOrder: 0,
				requiresShippingDefault: true,
				attributes: [
					{
						name: "Batch",
						code: "batch",
						kind: "variant_defining",
						position: 0,
						values: batchValues,
					},
				],
			}, products, new MemColl(), new MemColl(), new MemColl(), productAttributes, productAttributeValues),
		);

		const sizeAttribute = [...productAttributes.rows.values()].find((attribute) => attribute.code === "batch");
		const sizeValues = [...productAttributeValues.rows.values()].filter((value) =>
			value.attributeId === sizeAttribute?.id,
		);
		if (!sizeAttribute || sizeValues.length < 2) {
			throw new Error("Test fixture missing required attributes");
		}
		const duplicateCandidateValue = sizeValues[100];
		if (!duplicateCandidateValue) {
			throw new Error("Test fixture missing paged attribute value");
		}

		for (let index = 0; index < 100; index += 1) {
			await createProductSkuHandler(
				catalogCtx<ProductSkuCreateInput>(
					{
						productId: product.product.id,
						skuCode: `V-${index + 1}`,
						status: "active",
						unitPriceMinor: 900 + index,
						inventoryQuantity: 5,
						inventoryVersion: 1,
						requiresShipping: true,
						isDigital: false,
						optionValues: [{ attributeId: sizeAttribute.id, attributeValueId: sizeValues[index]!.id }],
					},
					products,
					skus,
					new MemColl(),
					new MemColl(),
					productAttributes,
					productAttributeValues,
					productSkuOptionValues,
				),
			);
		}

		await skus.put("sku_duplicate_late", {
			id: "sku_duplicate_late",
			productId: product.product.id,
			skuCode: "V-DUP-PAGE",
			status: "active",
			unitPriceMinor: 999,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-04-07T00:00:00.000Z",
			updatedAt: "2026-04-07T00:00:00.000Z",
		});
		await productSkuOptionValues.put("sku_duplicate_late-size", {
			id: "sku_duplicate_late-size",
			skuId: "sku_duplicate_late",
			attributeId: sizeAttribute.id,
			attributeValueId: duplicateCandidateValue.id,
			createdAt: "2026-04-07T00:00:00.000Z",
			updatedAt: "2026-04-07T00:00:00.000Z",
		});

		const duplicateAttempt = createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: product.product.id,
					skuCode: "V-DUPLICATE",
					status: "active",
					unitPriceMinor: 1500,
					inventoryQuantity: 5,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
					optionValues: [{ attributeId: sizeAttribute.id, attributeValueId: duplicateCandidateValue.id }],
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				productAttributes,
				productAttributeValues,
				productSkuOptionValues,
			),
		);
		await expect(duplicateAttempt).rejects.toMatchObject({ code: "bad_request" });
	});

	it("updates SKU fields without changing immutable identifiers", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const created = await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: "parent",
					skuCode: "SIMPLE-A",
					status: "active",
					unitPriceMinor: 1299,
					inventoryQuantity: 10,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
				},
				products,
				skus,
			),
		);

		const updated = await updateProductSkuHandler(
			catalogCtx(
				{
					skuId: created.sku.id,
					unitPriceMinor: 1499,
				},
				products,
				skus,
			),
		);
		expect(updated.sku.unitPriceMinor).toBe(1499);
		expect(updated.sku.productId).toBe("parent");
	});

	it("rejects duplicate sku code on SKU update", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("parent_two", {
			id: "parent_two",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent-two",
			title: "Parent Two",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "parent",
			skuCode: "SKU-ONE",
			status: "active",
			unitPriceMinor: 1200,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_2", {
			id: "sku_2",
			productId: "parent_two",
			skuCode: "SKU-TWO",
			status: "active",
			unitPriceMinor: 1500,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const duplicate = updateProductSkuHandler(
			catalogCtx(
				{
					skuId: "sku_2",
					skuCode: "SKU-ONE",
				},
				products,
				skus,
			),
		);
		await expect(duplicate).rejects.toMatchObject({ code: "bad_request" });
	});

	it("sets SKU active/inactive state", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const created = await createProductSkuHandler(
			catalogCtx<ProductSkuCreateInput>(
				{
					productId: "parent",
					skuCode: "SIMPLE-A",
					status: "active",
					unitPriceMinor: 1299,
					inventoryQuantity: 10,
					inventoryVersion: 1,
					requiresShipping: true,
					isDigital: false,
				},
				products,
				skus,
			),
		);

		const archived = await setSkuStatusHandler(
			catalogCtx(
				{
					skuId: created.sku.id,
					status: "inactive",
				},
				products,
				skus,
			),
		);
		expect(archived.sku.status).toBe("inactive");
	});

	it("reconciles lifecycle state when SKU is reactivated", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		await products.put("parent", {
			id: "parent",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "parent",
			title: "Parent",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_auto", {
			id: "sku_auto",
			productId: "parent",
			skuCode: "AUTO",
			status: "active",
			unitPriceMinor: 2000,
			inventoryQuantity: 1,
			inventoryVersion: 1,
			requiresShipping: false,
			isDigital: false,
			lifecycleState: "valid",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const deactivated = await setSkuStatusHandler(
			catalogCtx(
				{
					skuId: "sku_auto",
					status: "inactive",
				},
				products,
				skus,
			),
		);
		expect(deactivated.sku.status).toBe("inactive");
		expect(deactivated.sku.lifecycleState).toBe("requires_review");

		const activated = await setSkuStatusHandler(
			catalogCtx(
				{
					skuId: "sku_auto",
					status: "active",
				},
				products,
				skus,
			),
		);
		expect(activated.sku.status).toBe("active");
		expect(activated.sku.lifecycleState).toBe("reconciled");
	});
});

describe("catalog asset handlers", () => {
	it("rejects binary-upload payload keys at the contract boundary", () => {
		expect(
			productAssetRegisterInputSchema.safeParse({
				externalAssetId: "media-1",
				provider: "media",
				file: "should-not-be-uploaded",
			}).success,
		).toBe(false);

		expect(
			productAssetLinkInputSchema.safeParse({
				assetId: "asset_1",
				targetType: "product",
				targetId: "prod_1",
				role: "gallery_image",
				position: 0,
				stream: "binary",
			}).success,
		).toBe(false);

		expect(
			productAssetUnlinkInputSchema.safeParse({
				linkId: "link_1",
				file: "should-not-be-uploaded",
			}).success,
		).toBe(false);

		expect(
			productAssetReorderInputSchema.safeParse({
				linkId: "link_1",
				position: 0,
				body: "not-expected",
			}).success,
		).toBe(false);
	});

	it("returns asset_not_found when linking an unknown asset", async () => {
		const products = new MemColl<StoredProduct>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "base",
			title: "Base",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const missingAsset = linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_missing",
					targetType: "product",
					targetId: "prod_1",
					role: "gallery_image",
					position: 0,
				},
				products,
			),
		);
		await expect(missingAsset).rejects.toMatchObject({ code: "asset_not_found" });
	});

	it("registers provider-agnostic asset metadata without binary payload", async () => {
		const productAssets = new MemColl<StoredProductAsset>();

		const out = await registerProductAssetHandler(
			catalogCtx<ProductAssetRegisterInput>(
				{
					externalAssetId: "media-123",
					provider: "media",
					fileName: "hero.jpg",
					mimeType: "image/jpeg",
					byteSize: 123_456,
				},
				new MemColl(),
				new MemColl(),
				productAssets,
			),
		);

		expect(out.asset.id).toMatch(ASSET_ID_PREFIX);
		expect(out.asset.provider).toBe("media");
		expect(out.asset.externalAssetId).toBe("media-123");
		expect(out.asset.mimeType).toBe("image/jpeg");
	});

	it("links media metadata rows to a product and enforces one primary image per target", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productAssets = new MemColl<StoredProductAsset>();
		const productAssetLinks = new MemColl<StoredProductAssetLink>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "base",
			title: "Base",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await productAssets.put("asset_1", {
			id: "asset_1",
			provider: "media",
			externalAssetId: "media-1",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAssets.put("asset_2", {
			id: "asset_2",
			provider: "media",
			externalAssetId: "media-2",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const first = await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_1",
					targetType: "product",
					targetId: "prod_1",
					role: "primary_image",
					position: 0,
				},
				products,
				skus,
				productAssets,
				productAssetLinks,
			),
		);
		expect(first.link.role).toBe("primary_image");
		expect(first.link.targetType).toBe("product");
		expect(first.link.targetId).toBe("prod_1");

		const duplicatePrimary = linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_2",
					targetType: "product",
					targetId: "prod_1",
					role: "primary_image",
					position: 1,
				},
				products,
				skus,
				productAssets,
				productAssetLinks,
			),
		);
		await expect(duplicatePrimary).rejects.toMatchObject({ code: "bad_request" });
	});

	it("links asset rows to SKU targets and supports reordering", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const productAssets = new MemColl<StoredProductAsset>();
		const productAssetLinks = new MemColl<StoredProductAssetLink>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "base",
			title: "Base",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "SKU-1",
			status: "active",
			unitPriceMinor: 1299,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		for (let index = 0; index < 2; index++) {
			await productAssets.put(`asset_${index + 1}`, {
				id: `asset_${index + 1}`,
				provider: "media",
				externalAssetId: `media-${index + 1}`,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			});
		}

		const first = await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_1",
					targetType: "sku",
					targetId: "sku_1",
					role: "gallery_image",
					position: 0,
				},
				products,
				skus,
				productAssets,
				productAssetLinks,
			),
		);
		const second = await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_2",
					targetType: "sku",
					targetId: "sku_1",
					role: "gallery_image",
					position: 1,
				},
				products,
				skus,
				productAssets,
				productAssetLinks,
			),
		);

		const reordered = await reorderCatalogAssetHandler(
			catalogCtx<ProductAssetReorderInput>({ linkId: second.link.id, position: 0 }, products, skus, productAssets, productAssetLinks),
		);
		expect(reordered.link.position).toBe(0);

		const byTarget = await productAssetLinks.query({ where: { targetType: "sku", targetId: "sku_1" } });
		const inOrder = byTarget.items.map((item) => item.data);
		const ordered = sortedImmutable(inOrder, (left, right) => left.position - right.position);
		expect(ordered[0]?.id).toBe(second.link.id);
		expect(ordered[1]?.id).toBe(first.link.id);
	});

	it("unlinks an asset and removes its link row", async () => {
		const products = new MemColl<StoredProduct>();
		const productAssets = new MemColl<StoredProductAsset>();
		const productAssetLinks = new MemColl<StoredProductAssetLink>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "base",
			title: "Base",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAssets.put("asset_1", {
			id: "asset_1",
			provider: "media",
			externalAssetId: "media-1",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const linked = await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_1",
					targetType: "product",
					targetId: "prod_1",
					role: "gallery_image",
				},
				products,
				new MemColl(),
				productAssets,
				productAssetLinks,
			),
		);

		const out = await unlinkCatalogAssetHandler(
			catalogCtx<ProductAssetUnlinkInput>(
				{
					linkId: linked.link.id,
				},
				products,
				new MemColl(),
				productAssets,
				productAssetLinks,
			),
		);
		expect(out.deleted).toBe(true);

		const removed = await productAssetLinks.get(linked.link.id);
		expect(removed).toBeNull();
	});

	it("returns asset_link_not_found when unlinking an unknown link", async () => {
		const out = unlinkCatalogAssetHandler(
			catalogCtx<ProductAssetUnlinkInput>(
				{ linkId: "missing-link" },
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
			),
		);
		await expect(out).rejects.toMatchObject({ code: "asset_link_not_found" });
	});

	it("normalizes remaining asset link positions after unlink", async () => {
		const products = new MemColl<StoredProduct>();
		const productAssets = new MemColl<StoredProductAsset>();
		const productAssetLinks = new MemColl<StoredProductAssetLink>();
		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "base",
			title: "Base",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAssets.put("asset_1", {
			id: "asset_1",
			provider: "media",
			externalAssetId: "media-1",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await productAssets.put("asset_2", {
			id: "asset_2",
			provider: "media",
			externalAssetId: "media-2",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const firstLink = await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_1",
					targetType: "product",
					targetId: "prod_1",
					role: "gallery_image",
				},
				products,
				new MemColl(),
				productAssets,
				productAssetLinks,
			),
		);
		const secondLink = await linkCatalogAssetHandler(
			catalogCtx<ProductAssetLinkInput>(
				{
					assetId: "asset_2",
					targetType: "product",
					targetId: "prod_1",
					role: "gallery_image",
				},
				products,
				new MemColl(),
				productAssets,
				productAssetLinks,
			),
		);

		const removed = await unlinkCatalogAssetHandler(
			catalogCtx<ProductAssetUnlinkInput>(
				{
					linkId: firstLink.link.id,
				},
				products,
				new MemColl(),
				productAssets,
				productAssetLinks,
			),
		);
		expect(removed.deleted).toBe(true);

		const remaining = await productAssetLinks.query({ where: { targetType: "product", targetId: "prod_1" } });
		expect(remaining.items).toHaveLength(1);
		expect(remaining.items[0]!.data.id).toBe(secondLink.link.id);
		expect(remaining.items[0]!.data.position).toBe(0);
	});
});

describe("catalog digital entitlement handlers", () => {
	it("rejects binary-upload payload keys at the contract boundary", () => {
		expect(
			digitalAssetCreateInputSchema.safeParse({
				externalAssetId: "media-1",
				provider: "media",
				file: "should-not-be-uploaded",
			}).success,
		).toBe(false);
		expect(
			digitalEntitlementCreateInputSchema.safeParse({
				skuId: "sku_1",
				digitalAssetId: "asset_1",
				grantedQuantity: 1,
				file: "should-not-be-uploaded",
			}).success,
		).toBe(false);
	});

	it("creates digital assets and entitlements, and enforces unique mapping per SKU+asset", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const digitalAssets = new MemColl<StoredDigitalAsset>();
		const digitalEntitlements = new MemColl<StoredDigitalEntitlement>();

		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "digital-product",
			title: "Digital Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "DIGI",
			status: "active",
			unitPriceMinor: 199,
			inventoryQuantity: 100,
			inventoryVersion: 1,
			requiresShipping: false,
			isDigital: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const asset = await createDigitalAssetHandler(
			catalogCtx<DigitalAssetCreateInput>(
				{
					externalAssetId: "media-101",
					provider: "media",
					label: "Product Manual",
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				digitalAssets,
				digitalEntitlements,
			),
		);

		const first = await createDigitalEntitlementHandler(
			catalogCtx<DigitalEntitlementCreateInput>(
				{
					skuId: "sku_1",
					digitalAssetId: asset.asset.id,
					grantedQuantity: 1,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				digitalAssets,
				digitalEntitlements,
			),
		);
		expect(first.entitlement.skuId).toBe("sku_1");
		expect(first.entitlement.digitalAssetId).toBe(asset.asset.id);
		await expect(
			createDigitalEntitlementHandler(
				catalogCtx<DigitalEntitlementCreateInput>(
					{
						skuId: "sku_1",
						digitalAssetId: asset.asset.id,
						grantedQuantity: 1,
					},
					products,
					skus,
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					digitalAssets,
					digitalEntitlements,
				),
			),
		).rejects.toMatchObject({ code: "bad_request" });
	});

	it("returns digital_asset_not_found when creating entitlements for missing digital asset", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const digitalAssets = new MemColl<StoredDigitalAsset>();
		const digitalEntitlements = new MemColl<StoredDigitalEntitlement>();

		await products.put("prod_1", {
			id: "prod_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "digital-product",
			title: "Digital Product",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_1", {
			id: "sku_1",
			productId: "prod_1",
			skuCode: "DIGI",
			status: "active",
			unitPriceMinor: 199,
			inventoryQuantity: 100,
			inventoryVersion: 1,
			requiresShipping: false,
			isDigital: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const missing = createDigitalEntitlementHandler(
			catalogCtx<DigitalEntitlementCreateInput>(
				{
					skuId: "sku_1",
					digitalAssetId: "asset_missing",
					grantedQuantity: 1,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				digitalAssets,
				digitalEntitlements,
			),
		);
		await expect(missing).rejects.toMatchObject({ code: "digital_asset_not_found" });
	});

	it("removes entitlement assignments", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const digitalAssets = new MemColl<StoredDigitalAsset>();
		const digitalEntitlements = new MemColl<StoredDigitalEntitlement>();

		await digitalEntitlements.put("ent_1", {
			id: "ent_1",
			skuId: "sku_1",
			digitalAssetId: "asset_1",
			grantedQuantity: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const out = await removeDigitalEntitlementHandler(
			catalogCtx(
				{ entitlementId: "ent_1" },
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				digitalAssets,
				digitalEntitlements,
			),
		);
		expect(out.deleted).toBe(true);

		const missing = await digitalEntitlements.get("ent_1");
		expect(missing).toBeNull();
	});

	it("returns digital_entitlement_not_found when removing a missing entitlement", async () => {
		const out = removeDigitalEntitlementHandler(
			catalogCtx(
				{ entitlementId: "missing-entitlement" },
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
			),
		);
		await expect(out).rejects.toMatchObject({ code: "digital_entitlement_not_found" });
	});
});

describe("catalog bundle handlers", () => {
	it("adds components and computes discount-aware bundle summary", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "public",
			slug: "starter-bundle",
			title: "Starter Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			bundleDiscountType: "fixed_amount",
			bundleDiscountValueMinor: 50,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component_1", {
			id: "prod_component_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "sock",
			title: "Sock",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component_2", {
			id: "prod_component_2",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "blanket",
			title: "Blanket",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_sock", {
			id: "sku_sock",
			productId: "prod_component_1",
			skuCode: "SOCK",
			status: "active",
			unitPriceMinor: 100,
			compareAtPriceMinor: 120,
			inventoryQuantity: 6,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_blanket", {
			id: "sku_blanket",
			productId: "prod_component_2",
			skuCode: "BLNK",
			status: "active",
			unitPriceMinor: 75,
			inventoryQuantity: 4,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_sock",
					quantity: 2,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);
		await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_blanket",
					quantity: 1,
					position: 1,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);

		const summary = await bundleComputeHandler(
			catalogCtx<BundleComputeInput>(
				{
					productId: "prod_bundle",
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);

		expect(summary.subtotalMinor).toBe(275);
		expect(summary.discountAmountMinor).toBe(50);
		expect(summary.finalPriceMinor).toBe(225);
		expect(summary.availability).toBe(3);
		expect(summary.components).toHaveLength(2);
	});

	it("sanitizes storefront bundle compute response", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const inventoryStock = new MemColl<StoredInventoryStock>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "public",
			slug: "winter-bundle",
			title: "Winter Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component", {
			id: "prod_component",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "component",
			title: "Component",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_component", {
			id: "sku_component",
			productId: "prod_component",
			skuCode: "CMP",
			status: "active",
			unitPriceMinor: 50,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_component",
					quantity: 2,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				inventoryStock,
			),
		);

		await inventoryStock.put("stock_component", {
			productId: "prod_bundle",
			variantId: "sku_component",
			quantity: 10,
			version: 1,
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const summary = await bundleComputeStorefrontHandler(
			catalogCtx<BundleComputeInput>(
				{
					productId: "prod_bundle",
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				inventoryStock,
			),
		);

		expect(summary.components).toHaveLength(1);
		const component = summary.components[0];
		expect((component as unknown as Record<string, unknown>).componentSkuId).toBeUndefined();
		expect((component as unknown as Record<string, unknown>).componentProductId).toBeUndefined();
	});

	it("allows admin bundle compute on hidden products", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "hidden",
			slug: "admin-bundle",
			title: "Admin Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component", {
			id: "prod_component",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "component",
			title: "Component",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_component", {
			id: "sku_component",
			productId: "prod_component",
			skuCode: "CMP",
			status: "active",
			unitPriceMinor: 50,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await addBundleComponentHandler(
			catalogCtx(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_component",
					quantity: 2,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);

		const summary = await bundleComputeHandler(
			catalogCtx(
				{
					productId: "prod_bundle",
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);

		expect(summary.availability).toBe(5);
		expect(summary.components).toHaveLength(1);
	});

	it("rejects storefront bundle compute for hidden bundles", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "hidden",
			slug: "starter-bundle",
			title: "Starter Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_bundle", {
			id: "sku_bundle",
			productId: "prod_bundle",
			skuCode: "BUNDLE",
			status: "active",
			unitPriceMinor: 0,
			inventoryQuantity: 1,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await expect(
			bundleComputeStorefrontHandler(
				catalogCtx<BundleComputeInput>(
					{
						productId: "prod_bundle",
					},
					products,
					skus,
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					bundleComponents,
				),
			),
		).rejects.toThrow("Product not available");
	});

	it("rejects storefront bundle compute when component products are not storefront-visible", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "public",
			slug: "public-bundle",
			title: "Public Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_hidden_component", {
			id: "prod_hidden_component",
			type: "simple",
			status: "active",
			visibility: "hidden",
			slug: "hidden-component",
			title: "Hidden Component",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_hidden", {
			id: "sku_hidden",
			productId: "prod_hidden_component",
			skuCode: "HID",
			status: "active",
			unitPriceMinor: 42,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_hidden",
					quantity: 1,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);

		await expect(
			bundleComputeStorefrontHandler(
				catalogCtx<BundleComputeInput>(
					{
						productId: "prod_bundle",
					},
					products,
					skus,
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					bundleComponents,
				),
			),
		).rejects.toThrow("Product not available");
	});

	it("rejects storefront bundle compute when component SKUs are inactive", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "public",
			slug: "active-bundle",
			title: "Active Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component", {
			id: "prod_component",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "component",
			title: "Component",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_component", {
			id: "sku_component",
			productId: "prod_component",
			skuCode: "CMP",
			status: "inactive",
			unitPriceMinor: 50,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_component",
					quantity: 1,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);

		await expect(
			bundleComputeStorefrontHandler(
				catalogCtx<BundleComputeInput>(
					{
						productId: "prod_bundle",
					},
					products,
					skus,
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					bundleComponents,
				),
			),
		).rejects.toThrow("Product not available");
	});

	it("supports component reorder and removal with position normalizing", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "public",
			slug: "winter-bundle",
			title: "Winter Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component_1", {
			id: "prod_component_1",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "boot",
			title: "Boot",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component_2", {
			id: "prod_component_2",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "cap",
			title: "Cap",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_component_3", {
			id: "prod_component_3",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "mitt",
			title: "Mittens",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await skus.put("sku_boot", {
			id: "sku_boot",
			productId: "prod_component_1",
			skuCode: "BOOT",
			status: "active",
			unitPriceMinor: 120,
			compareAtPriceMinor: 150,
			inventoryQuantity: 5,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_cap", {
			id: "sku_cap",
			productId: "prod_component_2",
			skuCode: "CAP",
			status: "active",
			unitPriceMinor: 40,
			inventoryQuantity: 4,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_mitt", {
			id: "sku_mitt",
			productId: "prod_component_3",
			skuCode: "MITT",
			status: "active",
			unitPriceMinor: 10,
			inventoryQuantity: 8,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		const addedFirst = await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_boot",
					quantity: 1,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);
		const addedSecond = await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_cap",
					quantity: 1,
					position: 1,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);
		const addedThird = await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_mitt",
					quantity: 1,
					position: 2,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);

		const reordered = await reorderBundleComponentHandler(
			catalogCtx<BundleComponentReorderInput>(
				{
					bundleComponentId: addedThird.component.id,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);
		expect(reordered.component.position).toBe(0);

		const removed = await removeBundleComponentHandler(
			catalogCtx<BundleComponentRemoveInput>(
				{ bundleComponentId: addedSecond.component.id },
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);
		expect(removed.deleted).toBe(true);

		const list = await bundleComponents.query({
			where: { bundleProductId: "prod_bundle" },
		});
		expect(list.items.find((row) => row.id === addedFirst.component.id)?.data.position).toBe(1);
		expect(list.items.find((row) => row.id === addedThird.component.id)?.data.position).toBe(0);
	});

	it("returns bundle_component_not_found when removing an unknown bundle component", async () => {
		const out = removeBundleComponentHandler(
			catalogCtx<BundleComponentRemoveInput>(
				{ bundleComponentId: "missing-component" },
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
			),
		);
		await expect(out).rejects.toMatchObject({ code: "bundle_component_not_found" });
	});

	it("rejects invalid bundle component composition", async () => {
		const products = new MemColl<StoredProduct>();
		const skus = new MemColl<StoredProductSku>();
		const bundleComponents = new MemColl<StoredBundleComponent>();

		await products.put("prod_bundle", {
			id: "prod_bundle",
			type: "bundle",
			status: "active",
			visibility: "public",
			slug: "nested-bundle",
			title: "Nested Bundle",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await products.put("prod_bundle_invalid", {
			id: "prod_bundle_invalid",
			type: "bundle",
			status: "active",
			visibility: "public",
			slug: "nested-bundle-invalid",
			title: "Nested Bundle Invalid",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("bundle_invalid_sku", {
			id: "bundle_invalid_sku",
			productId: "prod_bundle_invalid",
			skuCode: "BUNDLE-SKU",
			status: "active",
			unitPriceMinor: 50,
			inventoryQuantity: 10,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});

		await expect(
			addBundleComponentHandler(
				catalogCtx<BundleComponentAddInput>(
					{
						bundleProductId: "prod_bundle",
						componentSkuId: "bundle_invalid_sku",
						quantity: 1,
						position: 0,
					},
					products,
					skus,
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					bundleComponents,
				),
			),
		).rejects.toMatchObject({ code: "bad_request" });

		await products.put("prod_simple", {
			id: "prod_simple",
			type: "simple",
			status: "active",
			visibility: "public",
			slug: "simple-component",
			title: "Simple Component",
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await skus.put("sku_simple", {
			id: "sku_simple",
			productId: "prod_simple",
			skuCode: "SIMPLE",
			status: "active",
			unitPriceMinor: 30,
			inventoryQuantity: 20,
			inventoryVersion: 1,
			requiresShipping: true,
			isDigital: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await addBundleComponentHandler(
			catalogCtx<BundleComponentAddInput>(
				{
					bundleProductId: "prod_bundle",
					componentSkuId: "sku_simple",
					quantity: 1,
					position: 0,
				},
				products,
				skus,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				bundleComponents,
			),
		);
		await expect(
			addBundleComponentHandler(
				catalogCtx<BundleComponentAddInput>(
					{
						bundleProductId: "prod_bundle",
						componentSkuId: "sku_simple",
						quantity: 2,
						position: 1,
					},
					products,
					skus,
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					new MemColl(),
					bundleComponents,
				),
			),
		).rejects.toMatchObject({ code: "bad_request" });
		expect(bundleComponentAddInputSchema.safeParse({
			bundleProductId: "prod_bundle",
			componentSkuId: "sku_simple",
			quantity: 0,
			position: 0,
		}).success).toBe(false);
	});
});

describe("catalog organization", () => {
	it("creates categories and filters listing by category", async () => {
		const products = new MemColl<StoredProduct>();
		const categories = new MemColl<StoredCategory>();
		const productCategoryLinks = new MemColl<StoredProductCategoryLink>();

		const category = await createCategoryHandler(
			catalogCtx<CategoryCreateInput>(
				{
					name: "Electronics",
					slug: "electronics",
					position: 0,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);

		const listedCategories = await listCategoriesHandler(
			catalogCtx(
				{
					limit: 10,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);
		expect(listedCategories.items.map((item) => item.slug)).toEqual(["electronics"]);

		const cameraProduct = await createProductHandler(
			catalogCtx(
				{
					type: "simple",
					status: "active",
					visibility: "public",
					slug: "camera",
					title: "Camera",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
				},
				products,
			),
		);
		await createProductHandler(
			catalogCtx(
				{
					type: "simple",
					status: "active",
					visibility: "public",
					slug: "lamp",
					title: "Lamp",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 1,
					requiresShippingDefault: true,
				},
				products,
			),
		);

		const first = await listProductsHandler(
			catalogCtx(
				{
					type: "simple",
					limit: 10,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);
		expect(first.items.map((item) => item.product.slug)).toEqual(["camera", "lamp"]);

		await createProductCategoryLinkHandler(
			catalogCtx<ProductCategoryLinkInput>(
				{
					productId: cameraProduct.product.id,
					categoryId: category.category.id,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);

		const filtered = await listProductsHandler(
			catalogCtx(
				{
					type: "simple",
					categoryId: category.category.id,
					limit: 10,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);
		expect(filtered.items.map((item) => item.product.slug)).toEqual(["camera"]);
	});

	it("includes paged category members even when matched outside the product query default window", async () => {
		const products = new MemColl<StoredProduct>();
		const categories = new MemColl<StoredCategory>();
		const productCategoryLinks = new MemColl<StoredProductCategoryLink>();

		const category = await createCategoryHandler(
			catalogCtx<CategoryCreateInput>(
				{
					name: "Catalog",
					slug: "catalog",
					position: 0,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);

		let tailProductId = "";
		let tailProductSlug = "";
		for (let index = 0; index < 60; index += 1) {
			const response = await createProductHandler(
				catalogCtx<ProductCreateInput>(
					{
						type: "simple",
						status: "active",
						visibility: "public",
						slug: `product-${String(index).padStart(2, "0")}`,
						title: `Product ${index}`,
						shortDescription: "",
						longDescription: "",
						featured: false,
						sortOrder: index,
						requiresShippingDefault: true,
					},
					products,
				),
			);
			if (index === 59) {
				tailProductId = response.product.id;
				tailProductSlug = response.product.slug;
			}
		}

		await createProductCategoryLinkHandler(
			catalogCtx<ProductCategoryLinkInput>(
				{
					productId: tailProductId,
					categoryId: category.category.id,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);

		const filtered = await listProductsHandler(
			catalogCtx<ProductListInput>(
				{
					type: "simple",
					status: "active",
					visibility: "public",
					categoryId: category.category.id,
					limit: 50,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
				productCategoryLinks,
			),
		);

		expect(filtered.items.map((item) => item.product.slug)).toEqual([tailProductSlug]);
	});

	it("applies global category sorting across paged reads before limiting", async () => {
		const products = new MemColl<StoredProduct>();
		const categories = new PagedQueryMemColl<StoredCategory>(new Map());
		const now = "2026-04-07T12:00:00.000Z";

		for (let index = 0; index < 120; index += 1) {
			categories.rows.set(`cat_${String(index).padStart(3, "0")}`, {
				id: `cat_${String(index).padStart(3, "0")}`,
				name: `Category ${String(index).padStart(3, "0")}`,
				slug: `zzz-${String(index).padStart(3, "0")}`,
				position: 1,
				createdAt: now,
				updatedAt: now,
			});
		}

		categories.rows.set("cat_top", {
			id: "cat_top",
			name: "Top priority",
			slug: "a-top-priority",
			position: 0,
			createdAt: now,
			updatedAt: now,
		});

		const listed = await listCategoriesHandler(
			catalogCtx<CategoryListInput>(
				{ limit: 1 },
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				categories,
			),
		);

		expect(listed.items).toHaveLength(1);
		expect(listed.items[0]).toMatchObject({ id: "cat_top", slug: "a-top-priority" });
	});

	it("creates tags and filters listing by tag", async () => {
		const products = new MemColl<StoredProduct>();
		const tags = new MemColl<StoredProductTag>();
		const productTagLinks = new MemColl<StoredProductTagLink>();

		const tag = await createTagHandler(
			catalogCtx<TagCreateInput>(
				{
					name: "Featured",
					slug: "featured",
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				tags,
				productTagLinks,
			),
		);

		const listedTags = await listTagsHandler(
			catalogCtx(
				{
					limit: 10,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				tags,
				productTagLinks,
			),
		);
		expect(listedTags.items.map((item) => item.slug)).toEqual(["featured"]);

		const tumblerProduct = await createProductHandler(
			catalogCtx(
				{
					type: "simple",
					status: "active",
					visibility: "public",
					slug: "tumbler",
					title: "Tumbler",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 0,
					requiresShippingDefault: true,
				},
				products,
			),
		);
		await createProductHandler(
			catalogCtx(
				{
					type: "simple",
					status: "active",
					visibility: "public",
					slug: "matte",
					title: "Matte",
					shortDescription: "",
					longDescription: "",
					featured: false,
					sortOrder: 1,
					requiresShippingDefault: true,
				},
				products,
			),
		);

		await createProductTagLinkHandler(
			catalogCtx<ProductTagLinkInput>(
				{
					productId: tumblerProduct.product.id,
					tagId: tag.tag.id,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				tags,
				productTagLinks,
			),
		);

		const filtered = await listProductsHandler(
			catalogCtx(
				{
					type: "simple",
					tagId: tag.tag.id,
					limit: 10,
				},
				products,
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				new MemColl(),
				productTagLinks,
			),
		);
		expect(filtered.items.map((item) => item.product.slug)).toEqual(["tumbler"]);
	});

	it("returns category_link_not_found when unlinking a missing product-category link", async () => {
		const out = removeProductCategoryLinkHandler(
			catalogCtx<ProductCategoryUnlinkInput>(
				{ linkId: "missing-link" },
				new MemColl(),
			),
		);
		await expect(out).rejects.toMatchObject({ code: "category_link_not_found" });
	});

	it("returns tag_link_not_found when unlinking a missing product-tag link", async () => {
		const out = removeProductTagLinkHandler(
			catalogCtx<ProductTagUnlinkInput>(
				{ linkId: "missing-link" },
				new MemColl(),
			),
		);
		await expect(out).rejects.toMatchObject({ code: "tag_link_not_found" });
	});

	it("validates category and tag schema helpers", () => {
		expect(
			productCreateInputSchema.safeParse({
				type: "simple",
				status: "draft",
				visibility: "public",
				slug: "simple-with-bundle-discount",
				title: "Simple with discount",
				bundleDiscountType: "fixed_amount",
				bundleDiscountValueMinor: 100,
			}).success,
		).toBe(false);
		expect(
			productCreateInputSchema.safeParse({
				type: "bundle",
				status: "draft",
				visibility: "public",
				slug: "bundle-with-discount",
				title: "Bundle with discount",
				bundleDiscountType: "fixed_amount",
				bundleDiscountValueMinor: 100,
			}).success,
		).toBe(true);
		expect(categoryCreateInputSchema.safeParse({ name: "Tools", slug: "tools", position: 0 }).success).toBe(true);
		expect(categoryListInputSchema.safeParse({}).success).toBe(true);
		expect(productCategoryLinkInputSchema.safeParse({ productId: "p", categoryId: "c" }).success).toBe(true);
		expect(productCategoryUnlinkInputSchema.safeParse({ linkId: "link_1" }).success).toBe(true);
		expect(tagCreateInputSchema.safeParse({ name: "Gift", slug: "gift" }).success).toBe(true);
		expect(tagListInputSchema.safeParse({}).success).toBe(true);
		expect(productTagLinkInputSchema.safeParse({ productId: "p", tagId: "t" }).success).toBe(true);
		expect(productTagUnlinkInputSchema.safeParse({ linkId: "link_1" }).success).toBe(true);
		expect(
			productUpdateInputSchema.safeParse({
				productId: "p",
				bundleDiscountType: "percentage",
				bundleDiscountValueMinor: 500,
			}).success,
		).toBe(false);
		expect(
			productUpdateInputSchema.safeParse({
				productId: "p",
				bundleDiscountType: "fixed_amount",
				bundleDiscountValueBps: 100,
			}).success,
		).toBe(false);
	});
});
