import { describe, expect, it } from "vitest";
import { PluginRouteError } from "emdash";

import { createPlugin } from "./index.js";
import {
	addBundleComponentHandler,
	bundleComputeStorefrontHandler,
	createCategoryHandler,
	createDigitalAssetHandler,
	createDigitalEntitlementHandler,
	createProductCategoryLinkHandler,
	createProductHandler,
	createProductSkuHandler,
	createProductTagLinkHandler,
	createTagHandler,
	getProductHandler,
	getStorefrontProductBySlugHandler,
	getStorefrontProductHandler,
	linkCatalogAssetHandler,
	listCategoriesHandler,
	listProductSkusHandler,
	listProductsHandler,
	listStorefrontProductSkusHandler,
	listStorefrontProductsHandler,
	listTagsHandler,
	reorderCatalogAssetHandler,
	removeBundleComponentHandler,
	removeDigitalEntitlementHandler,
	removeProductCategoryLinkHandler,
	removeProductTagLinkHandler,
	reorderBundleComponentHandler,
	registerProductAssetHandler,
	setProductStateHandler,
	setSkuStatusHandler,
	unlinkCatalogAssetHandler,
	updateProductHandler,
	updateProductSkuHandler,
} from "./handlers/catalog.js";
import { cartGetHandler, cartUpsertHandler } from "./handlers/cart.js";
import { checkoutGetOrderHandler } from "./handlers/checkout-get-order.js";
import { checkoutHandler } from "./handlers/checkout.js";

describe("dashing-commerce plugin route surface", () => {
	it("exposes admin-only catalog read routes", () => {
		const routes = createPlugin().routes;

		expect(routes["admin/catalog/product/get"]).toBeDefined();
		expect(routes["admin/catalog/products"]).toBeDefined();
		expect(routes["admin/catalog/sku/list"]).toBeDefined();
	});

	it("admin catalog routes use admin read handlers and remain non-public", () => {
		const routes = createPlugin().routes;

		const adminProductGet = routes["admin/catalog/product/get"];
		const adminProducts = routes["admin/catalog/products"];
		const adminSkuList = routes["admin/catalog/sku/list"];

		expect(adminProductGet).toMatchObject({ handler: getProductHandler });
		expect(adminProducts).toMatchObject({ handler: listProductsHandler });
		expect(adminSkuList).toMatchObject({ handler: listProductSkusHandler });
		expect(adminProductGet?.public).toBeUndefined();
		expect(adminProducts?.public).toBeUndefined();
		expect(adminSkuList?.public).toBeUndefined();
	});

	it("keeps storefront catalog read routes distinct and public", () => {
		const routes = createPlugin().routes;

		const storefrontProductGet = routes["catalog/product/get"];
		expect(storefrontProductGet).toMatchObject({ public: true, handler: getStorefrontProductHandler });
		expect(routes["admin/catalog/product/get"]?.handler).not.toBe(storefrontProductGet?.handler);
	});

	it("keeps checkout endpoints public for consumer usage", () => {
		const routes = createPlugin().routes;

		expect(routes["checkout"]).toMatchObject({ public: true, handler: checkoutHandler });
		expect(routes["checkout/get-order"]).toMatchObject({ public: true, handler: checkoutGetOrderHandler });
	});

	it("enforces admin-only boundaries for catalog mutation routes", () => {
		const routes = createPlugin().routes;

		const adminMutationRouteMap = [
			["catalog/product/create", createProductHandler],
			["catalog/product/update", updateProductHandler],
			["catalog/product/state", setProductStateHandler],
			["catalog/sku/create", createProductSkuHandler],
			["catalog/sku/update", updateProductSkuHandler],
			["catalog/sku/state", setSkuStatusHandler],
			["product-assets/register", registerProductAssetHandler],
			["catalog/asset/link", linkCatalogAssetHandler],
			["catalog/asset/unlink", unlinkCatalogAssetHandler],
			["catalog/asset/reorder", reorderCatalogAssetHandler],
			["bundle-components/add", addBundleComponentHandler],
			["bundle-components/remove", removeBundleComponentHandler],
			["bundle-components/reorder", reorderBundleComponentHandler],
			["digital-assets/create", createDigitalAssetHandler],
			["digital-entitlements/create", createDigitalEntitlementHandler],
			["digital-entitlements/remove", removeDigitalEntitlementHandler],
			["catalog/category/create", createCategoryHandler],
			["catalog/category/link", createProductCategoryLinkHandler],
			["catalog/category/unlink", removeProductCategoryLinkHandler],
			["catalog/tag/create", createTagHandler],
			["catalog/tag/link", createProductTagLinkHandler],
			["catalog/tag/unlink", removeProductTagLinkHandler],
		] as const;

		for (const [route, handler] of adminMutationRouteMap) {
			expect(routes[route]).toMatchObject({ handler });
			expect(routes[route]?.public).toBeUndefined();
		}
	});

	it("keeps storefront catalog read routes public and distinct from admin read routes", () => {
		const routes = createPlugin().routes;

		const storefrontProductGet = routes["catalog/product/get"];
		expect(storefrontProductGet).toMatchObject({ public: true, handler: getStorefrontProductHandler });
		expect(routes["admin/catalog/product/get"]?.handler).not.toBe(storefrontProductGet?.handler);
		expect(routes["catalog/products"]).toMatchObject({ public: true, handler: listStorefrontProductsHandler });
		expect(routes["catalog/sku/list"]).toMatchObject({ public: true, handler: listStorefrontProductSkusHandler });
		expect(routes["catalog/product/get-by-slug"]).toMatchObject({
			public: true,
			handler: getStorefrontProductBySlugHandler,
		});
		expect(routes["catalog/category/list"]).toMatchObject({ public: true, handler: listCategoriesHandler });
		expect(routes["catalog/tag/list"]).toMatchObject({ public: true, handler: listTagsHandler });
		expect(routes["bundle/compute"]).toMatchObject({ public: true, handler: bundleComputeStorefrontHandler });
		expect(routes["admin/catalog/products"]).toMatchObject({ handler: listProductsHandler });
		expect(routes["admin/catalog/products"]?.public).toBeUndefined();
		expect(routes["admin/catalog/sku/list"]).toMatchObject({ handler: listProductSkusHandler });
		expect(routes["admin/catalog/sku/list"]?.public).toBeUndefined();
	});

	it("keeps storefront consumption routes public for cart, checkout, recommendations, and webhook", () => {
		const routes = createPlugin().routes;

		expect(routes["cart/upsert"]).toMatchObject({ public: true, handler: cartUpsertHandler });
		expect(routes["cart/get"]).toMatchObject({ public: true, handler: cartGetHandler });
		expect(routes["checkout"]).toMatchObject({ public: true, handler: checkoutHandler });
		expect(routes["checkout/get-order"]).toMatchObject({ public: true, handler: checkoutGetOrderHandler });
		expect(routes["recommendations"]).toMatchObject({ public: true });
		expect(routes["bundle/compute"]).toMatchObject({ public: true, handler: bundleComputeStorefrontHandler });
		expect(routes["catalog/products"]).toMatchObject({ public: true, handler: listStorefrontProductsHandler });
		expect(routes["webhooks/stripe"]).toMatchObject({ public: true });
	});

	it("documents complete storefront/public route surface expectations", () => {
		const routes = createPlugin().routes;

		const expectedPublicRoutes = [
			"cart/upsert",
			"cart/get",
			"bundle/compute",
			"catalog/product/get",
			"catalog/product/get-by-slug",
			"catalog/category/list",
			"catalog/tag/list",
			"catalog/products",
			"catalog/sku/list",
			"checkout",
			"checkout/get-order",
			"recommendations",
			"webhooks/stripe",
		] as const;
		for (const key of expectedPublicRoutes) {
			expect(routes[key]).toMatchObject({ public: true });
		}

		const expectedAdminReadRoutes = ["admin/catalog/product/get", "admin/catalog/products", "admin/catalog/sku/list"] as const;
		for (const key of expectedAdminReadRoutes) {
			expect(routes[key]?.public).toBeUndefined();
		}

		const expectedAdminMutationRoutes = [
			"catalog/product/create",
			"catalog/product/update",
			"catalog/product/state",
			"catalog/sku/create",
			"catalog/sku/update",
			"catalog/sku/state",
			"product-assets/register",
			"catalog/asset/link",
			"catalog/asset/unlink",
			"catalog/asset/reorder",
			"bundle-components/add",
			"bundle-components/remove",
			"bundle-components/reorder",
			"digital-assets/create",
			"digital-entitlements/create",
			"digital-entitlements/remove",
			"catalog/category/create",
			"catalog/category/link",
			"catalog/category/unlink",
			"catalog/tag/create",
			"catalog/tag/link",
			"catalog/tag/unlink",
		] as const;
		for (const key of expectedAdminMutationRoutes) {
			expect(routes[key]?.public).toBeUndefined();
		}
	});

	it("covers the full expected plugin route surface for this phase", () => {
		const routes = createPlugin().routes;
		const expectedRoutes = new Set([
			"cart/upsert",
			"cart/get",
			"bundle/compute",
			"catalog/product/get",
			"catalog/product/get-by-slug",
			"catalog/category/list",
			"catalog/tag/list",
			"catalog/products",
			"catalog/sku/list",
			"checkout",
			"checkout/get-order",
			"recommendations",
			"webhooks/stripe",
			"admin/catalog/product/get",
			"product-assets/register",
			"catalog/asset/link",
			"catalog/asset/unlink",
			"catalog/asset/reorder",
			"bundle-components/add",
			"bundle-components/remove",
			"bundle-components/reorder",
			"digital-assets/create",
			"digital-entitlements/create",
			"digital-entitlements/remove",
			"catalog/product/create",
			"catalog/product/update",
			"catalog/product/state",
			"catalog/category/create",
			"catalog/category/link",
			"catalog/category/unlink",
			"catalog/tag/create",
			"catalog/tag/link",
			"catalog/tag/unlink",
			"admin/catalog/products",
			"catalog/sku/create",
			"catalog/sku/update",
			"catalog/sku/state",
			"admin/catalog/sku/list",
		]);
		const actualRoutes = new Set(Object.keys(routes));
		expect(actualRoutes.size).toBe(expectedRoutes.size);

		for (const route of expectedRoutes) {
			expect(actualRoutes.has(route)).toBe(true);
		}

		for (const route of actualRoutes) {
			expect(expectedRoutes.has(route)).toBe(true);
		}
	});

	it("rejects non-POST for every registered route handler", async () => {
		const routes = createPlugin().routes;
		const nonPostMethods = ["GET", "HEAD", "PUT", "DELETE", "PATCH", "OPTIONS"] as const;

		for (const [routeName, route] of Object.entries(routes)) {
			for (const method of nonPostMethods) {
				const request = new Request(`https://example.test/${routeName}`, { method });
				await expect(Promise.resolve(route.handler({ request } as never))).rejects.toBeInstanceOf(
					PluginRouteError,
				);
			}
		}
	});

	it("uses explicit visibility expectations as the source of truth for route contracts", () => {
		const routes = createPlugin().routes;

		const routeSurface = {
			public: [
				"cart/upsert",
				"cart/get",
				"bundle/compute",
				"catalog/product/get",
				"catalog/product/get-by-slug",
				"catalog/category/list",
				"catalog/tag/list",
				"catalog/products",
				"catalog/sku/list",
				"checkout",
				"checkout/get-order",
				"recommendations",
				"webhooks/stripe",
			] as const,
			admin: [
				"admin/catalog/product/get",
				"product-assets/register",
				"catalog/asset/link",
				"catalog/asset/unlink",
				"catalog/asset/reorder",
				"bundle-components/add",
				"bundle-components/remove",
				"bundle-components/reorder",
				"digital-assets/create",
				"digital-entitlements/create",
				"digital-entitlements/remove",
				"catalog/product/create",
				"catalog/product/update",
				"catalog/product/state",
				"catalog/category/create",
				"catalog/category/link",
				"catalog/category/unlink",
				"catalog/tag/create",
				"catalog/tag/link",
				"catalog/tag/unlink",
				"admin/catalog/products",
				"catalog/sku/create",
				"catalog/sku/update",
				"catalog/sku/state",
				"admin/catalog/sku/list",
			] as const,
		};

		const expectedRoutes = [...routeSurface.public, ...routeSurface.admin];
		expect(Object.keys(routes)).toHaveLength(expectedRoutes.length);

		for (const route of routeSurface.public) {
			expect(routes[route]).toMatchObject({ public: true });
		}

		for (const route of routeSurface.admin) {
			expect(routes[route]?.public).toBeUndefined();
		}
	});
});

