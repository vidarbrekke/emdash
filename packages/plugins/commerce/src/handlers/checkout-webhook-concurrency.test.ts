import type { RouteContext } from "emdash";
import { describe, expect, it } from "vitest";

import { COMMERCE_SETTINGS_KEYS } from "../settings-keys.js";
import { WEBHOOK_RECEIPT_REASONS } from "../kernel/finalize-decision.js";
import { sha256HexAsync } from "../lib/crypto-adapter.js";
import type { CheckoutInput, StripeWebhookInput } from "../schemas.js";
import type {
	StoredBundleComponent,
	StoredDigitalAsset,
	StoredDigitalEntitlement,
	StoredCart,
	StoredIdempotencyKey,
	StoredInventoryLedgerEntry,
	StoredInventoryStock,
	StoredOrder,
	StoredPaymentAttempt,
	StoredProduct,
	StoredProductAsset,
	StoredProductAssetLink,
	StoredProductSku,
	StoredProductSkuOptionValue,
	StoredWebhookReceipt,
} from "../types.js";
import { webhookReceiptDocId, inventoryStockDocId, queryFinalizationStatus } from "../orchestration/finalize-payment.js";
import { checkoutHandler } from "./checkout.js";
import type { CheckoutClientResponse } from "./checkout-state.js";
import { hashWithSecret, stripeWebhookHandler } from "./webhooks-stripe.js";

type MemQueryOptions = {
	where?: Record<string, unknown>;
	cursor?: string;
	limit?: number;
};

type QueryResult<T> = {
	items: Array<{ id: string; data: T }>;
	hasMore: boolean;
};

type MemCollection<T extends object> = {
	get(id: string): Promise<T | null>;
	put(id: string, data: T): Promise<void>;
	delete: (id: string) => Promise<boolean>;
	query?: (options?: MemQueryOptions) => Promise<QueryResult<T>>;
	rows: Map<string, T>;
};

class MemColl<T extends object> implements MemCollection<T> {
	constructor(public readonly rows = new Map<string, T>()) {}

	async get(id: string): Promise<T | null> {
		const row = this.rows.get(id);
		return row === undefined ? null : structuredClone(row);
	}

	async put(id: string, data: T): Promise<void> {
		this.rows.set(id, structuredClone(data));
	}

	async delete(id: string): Promise<boolean> {
		return this.rows.delete(id);
	}

	async query(options: MemQueryOptions = {}): Promise<QueryResult<T>> {
		const where = options.where ?? {};
		let items = Array.from(this.rows.entries(), ([id, data]) => ({ id, data }));
		for (const [field, value] of Object.entries(where)) {
			items = items.filter((row) => (row.data as Record<string, unknown>)[field] === value);
		}
		if (typeof options.limit === "number") {
			items = items.slice(0, options.limit);
		}
		return { items, hasMore: false };
	}
}

class MemCollWithAtomicOps<T extends object> extends MemColl<T> {
	putIfAbsent = async (id: string, data: T): Promise<boolean> => {
		if (this.rows.has(id)) return false;
		await this.put(id, data);
		return true;
	};

	compareAndSwap = async (id: string, expectedVersion: string, data: T): Promise<boolean> => {
		const current = this.rows.get(id);
		if (!current) return false;
		const record = current as Record<string, unknown>;
		const currentVersion = typeof record.updatedAt === "string" ? record.updatedAt : record.createdAt;
		if (typeof currentVersion !== "string" || currentVersion !== expectedVersion) {
			return false;
		}
		await this.put(id, data);
		return true;
	};
}

class MemKv {
	private readonly store = new Map<string, unknown>();

	async get<T>(key: string): Promise<T | null> {
		const row = this.store.get(key);
		return row === undefined ? null : (row as T);
	}

	async set<T>(key: string, value: T): Promise<void> {
		this.store.set(key, value);
	}
}

class DefaultProductsColl extends MemColl<StoredProduct> {
	override async get(id: string): Promise<StoredProduct | null> {
		const row = this.rows.get(id);
		if (row) return structuredClone(row);
		const now = "2026-01-01T00:00:00.000Z";
		return {
			id,
			type: "simple",
			status: "active",
			visibility: "public",
			slug: id,
			title: id,
			shortDescription: "",
			longDescription: "",
			featured: false,
			sortOrder: 0,
			requiresShippingDefault: true,
			createdAt: now,
			updatedAt: now,
		};
	}
}

type CheckoutStorageContext = {
	idempotencyKeys: MemCollection<StoredIdempotencyKey>;
	orders: MemCollection<StoredOrder>;
	paymentAttempts: MemCollection<StoredPaymentAttempt>;
	carts: MemCollection<StoredCart>;
	inventoryStock: MemCollection<StoredInventoryStock>;
	kv: MemKv;
};

type CheckoutResult = CheckoutClientResponse & {
	paymentAttemptId: string;
};

type WebhookStorage = {
	orders: MemCollection<StoredOrder>;
	webhookReceipts: MemCollection<StoredWebhookReceipt>;
	paymentAttempts: MemCollection<StoredPaymentAttempt>;
	inventoryLedger: MemCollection<StoredInventoryLedgerEntry>;
	inventoryStock: MemCollection<StoredInventoryStock>;
};

function checkoutContext(args: CheckoutStorageContext & { idempotencyKey: string; cartId: string; ownerToken: string }): RouteContext<CheckoutInput> {
	return {
		request: new Request("https://example.local/checkout", {
			method: "POST",
			headers: {
				"Idempotency-Key": args.idempotencyKey,
			},
		}),
		input: {
			cartId: args.cartId,
			idempotencyKey: args.idempotencyKey,
			ownerToken: args.ownerToken,
		},
		storage: {
			idempotencyKeys: args.idempotencyKeys,
			orders: args.orders,
			paymentAttempts: args.paymentAttempts,
			carts: args.carts,
			inventoryStock: args.inventoryStock,
			products: new DefaultProductsColl(),
			productSkus: new MemColl<StoredProductSku>(),
			productSkuOptionValues: new MemColl<StoredProductSkuOptionValue>(),
			digitalAssets: new MemColl<StoredDigitalAsset>(),
			digitalEntitlements: new MemColl<StoredDigitalEntitlement>(),
			productAssetLinks: new MemColl<StoredProductAssetLink>(),
			productAssets: new MemColl<StoredProductAsset>(),
			bundleComponents: new MemColl<StoredBundleComponent>(),
		},
		requestMeta: {
			ip: "127.0.0.1",
		},
		kv: args.kv,
	} as RouteContext<CheckoutInput>;
}

async function buildWebhookContext(args: {
	storage: WebhookStorage;
	body: string;
	input: StripeWebhookInput;
	signatureTimestampMs: number;
	secret: string;
	kv: MemKv;
}): Promise<RouteContext<StripeWebhookInput>> {
	const signature = await hashWithSecret(args.secret, Math.floor(args.signatureTimestampMs / 1000), args.body);
	const req = new Request("https://example.local/webhooks/stripe", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"content-length": String(args.body.length),
			"Stripe-Signature": `t=${Math.floor(args.signatureTimestampMs / 1000)},v1=${signature}`,
		},
		body: args.body,
	});
	return {
		request: req,
		input: args.input,
		storage: args.storage as Record<string, unknown>,
		requestMeta: {
			ip: "127.0.0.1",
		},
		kv: args.kv,
	} as RouteContext<StripeWebhookInput>;
}

type CheckoutWorkflow = {
	checkout: CheckoutResult;
	cartId: string;
	quantity: number;
	initialStock: number;
	initialStockVersion: number;
	orders: MemColl<StoredOrder>;
	paymentAttempts: MemColl<StoredPaymentAttempt>;
	inventoryStock: MemColl<StoredInventoryStock>;
	inventoryLedger: MemColl<StoredInventoryLedgerEntry>;
	webhookReceipts: MemCollWithAtomicOps<StoredWebhookReceipt>;
	kv: MemKv;
	webhookSecret: string;
};

async function setupCheckoutForWebhook(): Promise<CheckoutWorkflow> {
	const now = "2026-01-01T00:00:00.000Z";
	const ownerToken = "checkout-webhook-owner-token";
	const ownerTokenHash = await sha256HexAsync(ownerToken);
	const cartId = "cart_concurrency_a";
	const idempotencyKey = "idem-checkout-concurrency-01";
	const productId = "product_simple";
	const quantity = 2;
	const initialStock = 10;
	const initialStockVersion = 1;

	const carts = new MemColl<StoredCart>(
		new Map([
			[
				cartId,
				{
					currency: "USD",
					lineItems: [
						{
							productId,
							quantity,
							inventoryVersion: initialStockVersion,
							unitPriceMinor: 1299,
						},
					],
					ownerTokenHash,
					createdAt: now,
					updatedAt: now,
				},
			],
		]),
	);

	const orders = new MemColl<StoredOrder>();
	const paymentAttempts = new MemColl<StoredPaymentAttempt>();
	const idempotencyKeys = new MemCollWithAtomicOps<StoredIdempotencyKey>();
	const inventoryStock = new MemColl<StoredInventoryStock>(
		new Map([
			[
				inventoryStockDocId(productId, ""),
				{
					productId,
					variantId: "",
					version: initialStockVersion,
					quantity: initialStock,
					updatedAt: now,
				},
			],
		]),
	);
	const webhookReceipts = new MemCollWithAtomicOps<StoredWebhookReceipt>();
	const inventoryLedger = new MemColl<StoredInventoryLedgerEntry>();
	const kv = new MemKv();
	const webhookSecret = "whsec_test_checkout_webhooks";
	await kv.set(COMMERCE_SETTINGS_KEYS.stripeWebhookSecret, webhookSecret);
	await kv.set(COMMERCE_SETTINGS_KEYS.stripeWebhookToleranceSeconds, 300);

	const checkout = (await checkoutHandler(
		checkoutContext({
			idempotencyKeys,
			orders,
			paymentAttempts,
			carts,
			inventoryStock,
			kv,
			idempotencyKey,
			cartId,
			ownerToken,
		}),
	)) as CheckoutResult;

	return {
		checkout,
		cartId,
		quantity,
		initialStock,
		initialStockVersion,
		orders,
		paymentAttempts,
		inventoryStock,
		inventoryLedger,
		webhookReceipts,
		kv,
		webhookSecret,
	};
}

function makeStripeWebhookEvent(args: {
	orderId: string;
	finalizeToken: string;
	eventId: string;
}): { body: StripeWebhookInput; raw: string } {
	const body = {
		id: args.eventId,
		object: "event",
		type: "payment_intent.succeeded",
		data: {
			object: {
				id: `pi_${args.eventId}`,
				object: "payment_intent",
				metadata: {
					orderId: args.orderId,
					finalizeToken: args.finalizeToken,
				},
			},
		},
	} as const;
	return { body: body as StripeWebhookInput, raw: JSON.stringify(body) };
}

describe("checkout-webhook concurrency hardening", () => {
	it("deduplicates concurrent webhook deliveries and keeps settlement idempotent", async () => {
		const flow = await setupCheckoutForWebhook();
		const webhookStorage: WebhookStorage = {
			orders: flow.orders,
			webhookReceipts: flow.webhookReceipts,
			paymentAttempts: flow.paymentAttempts,
			inventoryLedger: flow.inventoryLedger,
			inventoryStock: flow.inventoryStock,
		};
		const event = makeStripeWebhookEvent({
			orderId: flow.checkout.orderId,
			finalizeToken: flow.checkout.finalizeToken,
			eventId: "evt_checkout_concurrent_01",
		});

		const first = stripeWebhookHandler(
			await buildWebhookContext({
				storage: webhookStorage,
				body: event.raw,
				input: event.body,
				kv: flow.kv,
				secret: flow.webhookSecret,
				signatureTimestampMs: Date.now(),
			}),
		);
		const second = stripeWebhookHandler(
			await buildWebhookContext({
				storage: webhookStorage,
				body: event.raw,
				input: event.body,
				kv: flow.kv,
				secret: flow.webhookSecret,
				signatureTimestampMs: Date.now(),
			}),
		);
		const concurrent = await Promise.all([first, second]);
		for (const response of concurrent) {
			expect(response.ok).toBe(true);
			expect(response.orderId).toBe(flow.checkout.orderId);
			expect(response.replay).toBe(false);
		}

		const replay = await stripeWebhookHandler(
			await buildWebhookContext({
				storage: webhookStorage,
				body: event.raw,
				input: event.body,
				kv: flow.kv,
				secret: flow.webhookSecret,
				signatureTimestampMs: Date.now(),
			}),
		);
		expect(replay).toMatchObject({
			ok: true,
			replay: true,
			reason: WEBHOOK_RECEIPT_REASONS.PROCESSED,
		});

		const status = await queryFinalizationStatus(
			{
				orders: webhookStorage.orders,
				webhookReceipts: webhookStorage.webhookReceipts,
				paymentAttempts: webhookStorage.paymentAttempts,
				inventoryLedger: webhookStorage.inventoryLedger,
				inventoryStock: webhookStorage.inventoryStock,
			},
			flow.checkout.orderId,
			"stripe",
			event.body.id,
		);
		expect(status).toMatchObject({
			receiptStatus: "processed",
			isInventoryApplied: true,
			isOrderPaid: true,
			isPaymentAttemptSucceeded: true,
			isReceiptProcessed: true,
			resumeState: "replay_processed",
		});

		const stock = await flow.inventoryStock.get(inventoryStockDocId("product_simple", ""));
		expect(stock).not.toBeNull();
		expect(stock?.quantity).toBe(flow.initialStock - flow.quantity);
		expect(stock?.version).toBe(flow.initialStockVersion + 1);

		const attempts = await flow.paymentAttempts.query({
			where: {
				orderId: flow.checkout.orderId,
				providerId: "stripe",
				status: "succeeded",
			},
			limit: 10,
		});
		expect(attempts.items).toHaveLength(1);

		const ledger = await flow.inventoryLedger.query({
			where: { referenceType: "order", referenceId: flow.checkout.orderId },
			limit: 10,
		});
		expect(ledger.items).toHaveLength(1);

		const receipt = await flow.webhookReceipts.get(webhookReceiptDocId("stripe", event.body.id));
		expect(receipt).toMatchObject({
			claimState: "released",
			status: "processed",
			errorCode: undefined,
		});
	});

it("returns conflict for stale non-finalizable order state and keeps replay deterministic", async () => {
		const flow = await setupCheckoutForWebhook();
		const webhookStorage: WebhookStorage = {
			orders: flow.orders,
			webhookReceipts: flow.webhookReceipts,
			paymentAttempts: flow.paymentAttempts,
			inventoryLedger: flow.inventoryLedger,
			inventoryStock: flow.inventoryStock,
		};
		const staleOrder = await flow.orders.get(flow.checkout.orderId);
		expect(staleOrder).not.toBeNull();
		await flow.orders.put(flow.checkout.orderId, {
			...(staleOrder as StoredOrder),
			paymentPhase: "processing",
		});

		const event = makeStripeWebhookEvent({
			orderId: flow.checkout.orderId,
			finalizeToken: flow.checkout.finalizeToken,
			eventId: "evt_checkout_stale_state_01",
		});

		await expect(
			stripeWebhookHandler(
				await buildWebhookContext({
					storage: webhookStorage,
					body: event.raw,
					input: event.body,
					kv: flow.kv,
					secret: flow.webhookSecret,
					signatureTimestampMs: Date.now(),
				}),
			),
		).rejects.toMatchObject({ code: "order_state_conflict" });

		const conflictReceipt = await flow.webhookReceipts.get(webhookReceiptDocId("stripe", event.body.id));
		expect(conflictReceipt).toBeNull();

		await expect(
			stripeWebhookHandler(
				await buildWebhookContext({
					storage: webhookStorage,
					body: event.raw,
					input: event.body,
					kv: flow.kv,
					secret: flow.webhookSecret,
					signatureTimestampMs: Date.now(),
				}),
			),
		).rejects.toMatchObject({ code: "order_state_conflict" });
		const status = await queryFinalizationStatus(
			{
				orders: webhookStorage.orders,
				webhookReceipts: webhookStorage.webhookReceipts,
				paymentAttempts: webhookStorage.paymentAttempts,
				inventoryLedger: webhookStorage.inventoryLedger,
				inventoryStock: webhookStorage.inventoryStock,
			},
			flow.checkout.orderId,
			"stripe",
			event.body.id,
		);
		expect(status).toMatchObject({
			receiptStatus: "missing",
			receiptErrorCode: undefined,
			isInventoryApplied: false,
			isOrderPaid: false,
			isPaymentAttemptSucceeded: false,
			isReceiptProcessed: false,
			resumeState: "not_started",
		});

	const stock = await flow.inventoryStock.get(inventoryStockDocId("product_simple", ""));
	expect(stock).not.toBeNull();
	expect(stock?.quantity).toBe(flow.initialStock);
	expect(stock?.version).toBe(flow.initialStockVersion);
	});

});
