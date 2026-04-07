import { describe, expect, it } from "vitest";

import { createPlugin } from "./index.js";
import {
	getProductHandler,
	getStorefrontProductHandler,
	listProductSkusHandler,
	listProductsHandler,
} from "./handlers/catalog.js";
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
});

