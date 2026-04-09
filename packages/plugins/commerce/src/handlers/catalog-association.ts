import type { RouteContext } from "emdash";
import { randomHex } from "../lib/crypto-adapter.js";
import { throwCommerceApiError, throwBadRequest } from "../route-errors.js";
import { sortedImmutable } from "../lib/sort-immutable.js";
import type {
	CategoryCreateInput,
	CategoryListInput,
	ProductCategoryLinkInput,
	ProductCategoryUnlinkInput,
	TagCreateInput,
	TagListInput,
	ProductTagLinkInput,
	ProductTagUnlinkInput,
} from "../schemas.js";
import type {
	StoredCategory,
	StoredProduct,
	StoredProductCategoryLink,
	StoredProductTag,
	StoredProductTagLink,
} from "../types.js";
import type {
	CategoryResponse,
	CategoryListResponse,
	ProductCategoryLinkResponse,
	ProductCategoryLinkUnlinkResponse,
	TagResponse,
	TagListResponse,
	ProductTagLinkResponse,
	ProductTagLinkUnlinkResponse,
} from "./catalog.js";
import { asCollection, getNowIso, putWithConflictHandling } from "./catalog-conflict.js";
import { queryAllPages } from "./catalog-read-model.js";

export async function handleCreateCategory(ctx: RouteContext<CategoryCreateInput>): Promise<CategoryResponse> {
	const categories = asCollection<StoredCategory>(ctx.storage.categories);
	const nowIso = getNowIso();

	if (ctx.input.parentId) {
		const parent = await categories.get(ctx.input.parentId);
		if (!parent) {
			throwBadRequest(`Category parent not found: ${ctx.input.parentId}`);
		}
	}

	const id = `cat_${await randomHex(6)}`;
	const category: StoredCategory = {
		id,
		name: ctx.input.name,
		slug: ctx.input.slug,
		parentId: ctx.input.parentId,
		position: ctx.input.position,
		createdAt: nowIso,
		updatedAt: nowIso,
	};
	await putWithConflictHandling(categories, id, category, {
		where: { slug: ctx.input.slug },
		message: `Category slug already exists: ${ctx.input.slug}`,
	});
	return { category };
}

export async function handleListCategories(ctx: RouteContext<CategoryListInput>): Promise<CategoryListResponse> {
	const categories = asCollection<StoredCategory>(ctx.storage.categories);

	const where: Record<string, string> = {};
	if (ctx.input.parentId) {
		where.parentId = ctx.input.parentId;
	}

	const rows = await queryAllPages((cursor) =>
		categories.query({
			where,
			cursor,
			limit: 100,
		}),
	);
	const sorted = sortedImmutable(
		rows.map((row) => row.data),
		(left, right) => left.position - right.position || left.slug.localeCompare(right.slug),
	);
	const items = sorted.slice(0, ctx.input.limit);
	return { items };
}

export async function handleCreateProductCategoryLink(
	ctx: RouteContext<ProductCategoryLinkInput>,
): Promise<ProductCategoryLinkResponse> {
	const products = asCollection<StoredProduct>(ctx.storage.products);
	const categories = asCollection<StoredCategory>(ctx.storage.categories);
	const productCategoryLinks = asCollection<StoredProductCategoryLink>(ctx.storage.productCategoryLinks);
	const nowIso = getNowIso();

	const product = await products.get(ctx.input.productId);
	if (!product) {
		throwCommerceApiError({ code: "PRODUCT_UNAVAILABLE", message: "Product not found" });
	}
	const category = await categories.get(ctx.input.categoryId);
	if (!category) {
		throwBadRequest(`Category not found: ${ctx.input.categoryId}`);
	}

	const id = `prod_cat_link_${await randomHex(6)}`;
	const link: StoredProductCategoryLink = {
		id,
		productId: ctx.input.productId,
		categoryId: ctx.input.categoryId,
		createdAt: nowIso,
		updatedAt: nowIso,
	};
	await putWithConflictHandling(productCategoryLinks, id, link, {
		where: {
			productId: ctx.input.productId,
			categoryId: ctx.input.categoryId,
		},
		message: "Product-category link already exists",
	});
	return { link };
}

export async function handleRemoveProductCategoryLink(
	ctx: RouteContext<ProductCategoryUnlinkInput>,
): Promise<ProductCategoryLinkUnlinkResponse> {
	const productCategoryLinks = asCollection<StoredProductCategoryLink>(ctx.storage.productCategoryLinks);
	const link = await productCategoryLinks.get(ctx.input.linkId);
	if (!link) {
		throwCommerceApiError({ code: "CATEGORY_LINK_NOT_FOUND", message: "Product-category link not found" });
	}

	await productCategoryLinks.delete(ctx.input.linkId);
	return { deleted: true };
}

export async function handleCreateTag(ctx: RouteContext<TagCreateInput>): Promise<TagResponse> {
	const tags = asCollection<StoredProductTag>(ctx.storage.productTags);
	const nowIso = getNowIso();

	const id = `tag_${await randomHex(6)}`;
	const tag: StoredProductTag = {
		id,
		name: ctx.input.name,
		slug: ctx.input.slug,
		createdAt: nowIso,
		updatedAt: nowIso,
	};
	await putWithConflictHandling(tags, id, tag, {
		where: { slug: ctx.input.slug },
		message: `Tag slug already exists: ${ctx.input.slug}`,
	});
	return { tag };
}

export async function handleListTags(ctx: RouteContext<TagListInput>): Promise<TagListResponse> {
	const tags = asCollection<StoredProductTag>(ctx.storage.productTags);
	const rows = await queryAllPages((cursor) =>
		tags.query({
			cursor,
			limit: 100,
		}),
	);
	const sorted = sortedImmutable(rows.map((row) => row.data), (left, right) => left.slug.localeCompare(right.slug));
	const items = sorted.slice(0, ctx.input.limit);
	return { items };
}

export async function handleCreateProductTagLink(ctx: RouteContext<ProductTagLinkInput>): Promise<ProductTagLinkResponse> {
	const products = asCollection<StoredProduct>(ctx.storage.products);
	const tags = asCollection<StoredProductTag>(ctx.storage.productTags);
	const productTagLinks = asCollection<StoredProductTagLink>(ctx.storage.productTagLinks);
	const nowIso = getNowIso();

	const product = await products.get(ctx.input.productId);
	if (!product) {
		throwCommerceApiError({ code: "PRODUCT_UNAVAILABLE", message: "Product not found" });
	}
	const tag = await tags.get(ctx.input.tagId);
	if (!tag) {
		throwBadRequest(`Tag not found: ${ctx.input.tagId}`);
	}

	const id = `prod_tag_link_${await randomHex(6)}`;
	const link: StoredProductTagLink = {
		id,
		productId: ctx.input.productId,
		tagId: ctx.input.tagId,
		createdAt: nowIso,
		updatedAt: nowIso,
	};
	await putWithConflictHandling(productTagLinks, id, link, {
		where: {
			productId: ctx.input.productId,
			tagId: ctx.input.tagId,
		},
		message: "Product-tag link already exists",
	});
	return { link };
}

export async function handleRemoveProductTagLink(ctx: RouteContext<ProductTagUnlinkInput>): Promise<ProductTagLinkUnlinkResponse> {
	const productTagLinks = asCollection<StoredProductTagLink>(ctx.storage.productTagLinks);
	const link = await productTagLinks.get(ctx.input.linkId);
	if (!link) {
		throwCommerceApiError({ code: "TAG_LINK_NOT_FOUND", message: "Product-tag link not found" });
	}
	await productTagLinks.delete(ctx.input.linkId);
	return { deleted: true };
}
