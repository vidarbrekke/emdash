import { describe, expect, it } from "vitest";

import { POST } from "../../../src/astro/routes/api/plugins/route-handler.ts";

describe("plugin route middleware: auth boundary", () => {
	it("rejects non-public plugin routes without session user", async () => {
		let handleCalled = false;
		const context = {
			params: {
				pluginId: "dashing-commerce",
				path: "admin/catalog/product/get",
			},
			request: new Request("https://example.local/_emdash/api/plugins/dashing-commerce/admin/catalog/product/get", {
				method: "POST",
			}),
			locals: {
				emdash: {
					getPluginRouteMeta: () => ({ public: false }),
					handlePluginApiRoute: async () => {
						handleCalled = true;
						return { success: true, data: "unexpected" };
					},
				},
			},
		} as Parameters<typeof POST>[0];

		const response = await POST(context);
		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({
			error: {
				code: "UNAUTHORIZED",
			},
		});
		expect(handleCalled).toBe(false);
	});

	it("allows public plugin routes to reach handler without session user", async () => {
		let handleCalled = false;
		const context = {
			params: {
				pluginId: "dashing-commerce",
				path: "cart/get",
			},
			request: new Request("https://example.local/_emdash/api/plugins/dashing-commerce/cart/get", {
				method: "POST",
			}),
			locals: {
				emdash: {
					getPluginRouteMeta: () => ({ public: true }),
					handlePluginApiRoute: async () => {
						handleCalled = true;
						return { success: true, data: { success: true } };
					},
				},
			},
		} as Parameters<typeof POST>[0];

		const response = await POST(context);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: { success: true },
		});
		expect(handleCalled).toBe(true);
	});
});
