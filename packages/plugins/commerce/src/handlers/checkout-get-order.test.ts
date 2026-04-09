import type { RouteContext } from "emdash";
import { describe, expect, it } from "vitest";

import { sha256HexAsync } from "../lib/crypto-adapter.js";
import type { CheckoutGetOrderInput } from "../schemas.js";
import type { StoredOrder } from "../types.js";
import { checkoutGetOrderHandler } from "./checkout-get-order.js";
import { CHECKOUT_GET_ORDER_RESPONSE_KEYS } from "./response-contract-fixtures.js";

type MemColl<T extends object> = {
	get(id: string): Promise<T | null>;
	put(id: string, data: T): Promise<void>;
	rows: Map<string, T>;
};

class MemCollImpl<T extends object> implements MemColl<T> {
	constructor(public readonly rows = new Map<string, T>()) {}

	async get(id: string): Promise<T | null> {
		const row = this.rows.get(id);
		return row ? structuredClone(row) : null;
	}

	async put(id: string, data: T): Promise<void> {
		this.rows.set(id, structuredClone(data));
	}
}

function ctxFor(orderId: string, finalizeToken?: string): RouteContext<CheckoutGetOrderInput> {
	return {
		request: new Request("https://example.test/checkout/get-order", { method: "POST" }),
		input: { orderId, finalizeToken },
		storage: { orders: new MemCollImpl<StoredOrder>() },
	} as unknown as RouteContext<CheckoutGetOrderInput>;
}

describe("checkoutGetOrderHandler", () => {
	const now = "2026-04-03T12:00:00.000Z";
	const token = "a".repeat(32);
	const orderBase: StoredOrder = {
		cartId: "cart_1",
		paymentPhase: "payment_pending",
		currency: "USD",
		finalizeTokenHash: "placeholder-finalize-token-hash",
		lineItems: [
			{
				productId: "p1",
				quantity: 1,
				inventoryVersion: 1,
				unitPriceMinor: 100,
			},
		],
		totalMinor: 100,
		createdAt: now,
		updatedAt: now,
	};

	it("returns a public order snapshot when finalize token matches", async () => {
		const orderId = "ord_1";
		const order: StoredOrder = {
			...orderBase,
			finalizeTokenHash: await sha256HexAsync(token),
		};
		const mem = new MemCollImpl(new Map([[orderId, order]]));
		const out = await checkoutGetOrderHandler({
			...ctxFor(orderId, token),
			storage: { orders: mem },
		} as unknown as RouteContext<CheckoutGetOrderInput>);

		expect(out.order).toEqual({
			cartId: order.cartId,
			paymentPhase: order.paymentPhase,
			currency: order.currency,
			lineItems: order.lineItems,
			totalMinor: order.totalMinor,
			createdAt: order.createdAt,
			updatedAt: order.updatedAt,
		});
		expect("finalizeTokenHash" in out.order).toBe(false);
	});

	it("locks down checkout get-order public response keys", async () => {
		const orderId = "ord_snapshot";
		const tokenValue = "snapshot-token";
		const tokenHash = await sha256HexAsync(tokenValue);
		const order: StoredOrder = {
			...orderBase,
			cartId: "cart_snapshot",
			totalMinor: 150,
			createdAt: "2026-04-08T12:00:00.000Z",
			updatedAt: "2026-04-08T12:00:00.000Z",
			finalizeTokenHash: tokenHash,
			lineItems: [
				{ productId: "p1", quantity: 1, inventoryVersion: 2, unitPriceMinor: 150 },
			],
		};
		const mem = new MemCollImpl(new Map([[orderId, order]]));
		const out = await checkoutGetOrderHandler({
			...ctxFor(orderId, tokenValue),
			storage: { orders: mem },
		} as unknown as RouteContext<CheckoutGetOrderInput>);

		expect(new Set(Object.keys(out.order))).toEqual(new Set(CHECKOUT_GET_ORDER_RESPONSE_KEYS));
		expect("finalizeTokenHash" in out.order).toBe(false);
	});

	it("rejects missing token when order requires one", async () => {
		const orderId = "ord_2";
		const order: StoredOrder = { ...orderBase, finalizeTokenHash: await sha256HexAsync(token) };
		const mem = new MemCollImpl(new Map([[orderId, order]]));
		await expect(
			checkoutGetOrderHandler({
				...ctxFor(orderId),
				storage: { orders: mem },
			} as unknown as RouteContext<CheckoutGetOrderInput>),
		).rejects.toMatchObject({ code: "order_token_required" });
	});

	it("rejects wrong finalize token when order requires one", async () => {
		const orderId = "ord_3";
		const order: StoredOrder = { ...orderBase, finalizeTokenHash: await sha256HexAsync(token) };
		const mem = new MemCollImpl(new Map([[orderId, order]]));
		await expect(
			checkoutGetOrderHandler({
				...ctxFor(orderId, "wrong_finalization_token_1234567890"),
				storage: { orders: mem },
			} as unknown as RouteContext<CheckoutGetOrderInput>),
		).rejects.toMatchObject({ code: "order_token_invalid" });
	});

});
