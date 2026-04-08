/**
 * Checkout: cart → `payment_pending` order + `pending` payment attempt (Stripe session in a later slice).
 * When the cart has `ownerTokenHash`, `ownerToken` must match (same possession proof as `cart/get`).
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";

import { validateIdempotencyKey } from "../kernel/idempotency-key.js";
import { COMMERCE_LIMITS } from "../kernel/limits.js";
import { cartContentFingerprint } from "../lib/cart-fingerprint.js";
import { buildOrderLineSnapshots } from "../lib/catalog-order-snapshots.js";
import { validateLineItemsStockForCheckout } from "../lib/checkout-inventory-validation.js";
import { projectCartLineItemsForStorage } from "../lib/cart-lines.js";
import { assertCartOwnerToken } from "../lib/cart-owner-token.js";
import { validateCartLineItems } from "../lib/cart-validation.js";
import { randomHex, sha256HexAsync } from "../lib/crypto-adapter.js";
import { isIdempotencyRecordFresh } from "../lib/idempotency-ttl.js";
import { mergeLineItemsBySku } from "../lib/merge-line-items.js";
import { consumeKvRateLimit } from "../lib/rate-limit-kv.js";
import { buildRateLimitActorKey } from "../lib/rate-limit-identity.js";
import { requirePost } from "../lib/require-post.js";
import { throwCommerceApiError } from "../route-errors.js";
import type { CheckoutInput } from "../schemas.js";
import type {
	StoredCart,
	StoredIdempotencyKey,
	StoredOrder,
	StoredProduct,
	StoredProductAsset,
	StoredProductAssetLink,
	StoredProductSku,
	StoredProductSkuOptionValue,
	StoredDigitalAsset,
	StoredDigitalEntitlement,
	StoredBundleComponent,
	StoredPaymentAttempt,
	StoredInventoryStock,
	OrderLineItem,
} from "../types.js";
import type { CheckoutPendingState, CheckoutResponse } from "./checkout-state.js";
import {
	CHECKOUT_PENDING_KIND,
	CHECKOUT_ROUTE,
	computeCheckoutReplayIntegrity,
	decideCheckoutReplayState,
	deterministicOrderId,
	deterministicPaymentAttemptId,
	restorePendingCheckout,
	resolvePaymentProviderId,
	toCheckoutClientResponse,
	validateCachedCheckoutCompleted,
} from "./checkout-state.js";

function asCollection<T>(raw: unknown): StorageCollection<T> {
	return raw as StorageCollection<T>;
}

type CheckoutLockCollection = StorageCollection<StoredIdempotencyKey> & {
	putIfAbsent?: (id: string, data: StoredIdempotencyKey) => Promise<boolean>;
	compareAndSwap?: (id: string, expectedVersion: string, data: StoredIdempotencyKey) => Promise<boolean>;
};

type CheckoutAtomicSupportArgs = {
	path: "checkout";
	hasPutIfAbsent: boolean;
	hasCompareAndSwap: boolean;
};

type CheckoutCartLock = {
	kind: "checkout_cart_lock";
	cartId: string;
	requestId: string;
	expiresAt: string;
};

const CHECKOUT_CART_LOCK_ROUTE = "checkout-cart-lock";
const CHECKOUT_CART_LOCK_KIND = "checkout_cart_lock";
const CHECKOUT_CART_LOCK_TTL_MS = 30_000;

function assertAtomicMoneyPathSupport(args: CheckoutAtomicSupportArgs): void {
	if (!args.hasPutIfAbsent || !args.hasCompareAndSwap) {
		throwCommerceApiError({
			code: "ATOMIC_STORAGE_REQUIRED",
			message: `[commerce:${args.path}] atomic claim support is required`,
		});
	}
}

/**
 * Cart checkout guards two race windows:
 * 1) persistent, short-lived cart-scoped lock (`checkout-cart-lock`) to serialize concurrent requests
 * 2) residual open `payment_pending` order scan as a durability fallback when lock writes fail or stale locks are reclaimed.
 *
 * The lock is TTL-based to avoid stranded mutexes during worker crashes and to limit recovery delay.
 */

function checkoutCartLockId(lockKeyHash: string): string {
	return `checkout-lock:${lockKeyHash}`;
}

async function buildCheckoutCartLockRecord(args: {
	cartId: string;
	requestId: string;
	nowIso: string;
	nowMs: number;
	expiresMs: number;
}): Promise<{ lockId: string; lockRecord: StoredIdempotencyKey }> {
	const lockKeyHash = await sha256HexAsync(`checkout-cart-lock|${args.cartId}`);
	return {
		lockId: checkoutCartLockId(lockKeyHash),
		lockRecord: {
			route: CHECKOUT_CART_LOCK_ROUTE,
			keyHash: lockKeyHash,
			httpStatus: 409,
			responseBody: {
				kind: CHECKOUT_CART_LOCK_KIND,
				cartId: args.cartId,
				requestId: args.requestId,
				expiresAt: new Date(args.nowMs + args.expiresMs).toISOString(),
			},
			createdAt: args.nowIso,
		},
	};
}

function parseCheckoutCartLock(payload: unknown): CheckoutCartLock | null {
	if (!payload || typeof payload !== "object") return null;
	const candidate = payload as Record<string, unknown>;
	if (candidate.kind !== CHECKOUT_CART_LOCK_KIND) return null;
	if (typeof candidate.cartId !== "string" || candidate.cartId.length === 0) return null;
	if (typeof candidate.requestId !== "string" || candidate.requestId.length === 0) return null;
	if (typeof candidate.expiresAt !== "string" || candidate.expiresAt.length === 0) return null;
	return {
		kind: CHECKOUT_CART_LOCK_KIND,
		cartId: candidate.cartId,
		requestId: candidate.requestId,
		expiresAt: candidate.expiresAt,
	};
}

function isCheckoutCartLockExpired(lock: CheckoutCartLock, nowMs: number): boolean {
	const expiresMs = Date.parse(lock.expiresAt);
	return !Number.isFinite(expiresMs) || nowMs > expiresMs;
}

function isCheckoutCartLockActive(lock: unknown, cartId: string, nowMs: number): lock is CheckoutCartLock {
	const parsed = parseCheckoutCartLock(lock);
	return Boolean(parsed && parsed.cartId === cartId && !isCheckoutCartLockExpired(parsed, nowMs));
}

function throwCheckoutCartLockConflict(args: { cartId: string; requestId?: string | null }): never {
	throwCommerceApiError({
		code: "ORDER_STATE_CONFLICT",
		message: "Checkout for this cart is already in progress",
		details: {
			cartId: args.cartId,
			...(args.requestId ? { requestId: args.requestId } : {}),
		},
	});
}

async function claimCheckoutCartLock(args: {
	locks: CheckoutLockCollection;
	cartId: string;
	requestId: string;
	nowIso: string;
	nowMs: number;
	expiresMs: number;
}): Promise<string> {
	const { lockId, lockRecord: staged } = await buildCheckoutCartLockRecord(args);
	const lockPayload = staged.keyHash;

	if (args.locks.putIfAbsent) {
		const locked = await args.locks.putIfAbsent(lockId, staged);
		if (locked) return lockId;

		const existing = await args.locks.get(lockId);
		if (!existing) {
			const replay = await args.locks.putIfAbsent(lockId, staged);
			if (replay) return lockId;
			throwCheckoutCartLockConflict({ cartId: args.cartId });
		}

		if (!isCheckoutCartLockActive(existing.responseBody, args.cartId, args.nowMs)) {
			if (!args.locks.compareAndSwap) {
				await args.locks.put(lockId, staged);
				return lockId;
			}
			const stolen = await args.locks.compareAndSwap(lockId, existing.createdAt, staged);
			if (!stolen) {
				throwCheckoutCartLockConflict({ cartId: args.cartId });
			}
			return lockId;
		}

		throwCheckoutCartLockConflict({
			cartId: args.cartId,
			requestId: parseCheckoutCartLock(existing.responseBody)?.requestId ?? lockPayload,
		});
	}

	const existing = await args.locks.get(lockId);
	if (existing) {
		if (!isCheckoutCartLockActive(existing.responseBody, args.cartId, args.nowMs)) {
			await args.locks.put(lockId, staged);
			return lockId;
		}
		throwCheckoutCartLockConflict({
			cartId: args.cartId,
			requestId: parseCheckoutCartLock(existing.responseBody)?.requestId ?? lockPayload,
		});
	}

	await args.locks.put(lockId, staged);
	return lockId;
}

async function releaseCheckoutCartLock(args: {
	locks: CheckoutLockCollection;
	lockId: string;
	requestId: string;
}): Promise<void> {
	const existing = await args.locks.get(args.lockId);
	if (!existing) return;

	const parsed = parseCheckoutCartLock(existing.responseBody);
	if (!parsed || parsed.requestId !== args.requestId) return;

	const releasedLockRecord: StoredIdempotencyKey = {
		...existing,
		responseBody: {
			kind: CHECKOUT_CART_LOCK_KIND,
			cartId: parsed.cartId,
			requestId: parsed.requestId,
			expiresAt: "1970-01-01T00:00:00.000Z",
		},
	};
	const compareAndSwapLock = args.locks.compareAndSwap;
	if (!compareAndSwapLock) return;
	const released = await compareAndSwapLock.call(args.locks, args.lockId, existing.createdAt, releasedLockRecord);
	if (!released) {
		return;
	}
}

function buildCheckoutLockRequestId(idempotencyKey: string, nowIso: string): string {
	return `${idempotencyKey}|${nowIso}`;
}

type SnapshotQueryCollection<T> = {
	get(id: string): Promise<T | null>;
	query(options?: { where?: Record<string, unknown>; limit?: number }): Promise<{ items: Array<{ id: string; data: T }>; hasMore: boolean }>;
};

function asSnapshotCollection<T>(raw: unknown): SnapshotQueryCollection<T> {
	if (raw) {
		const collection = raw as { get: (id: string) => Promise<T | null>; query?: SnapshotQueryCollection<T>["query"] };
		return {
			get: collection.get.bind(collection),
			query: collection.query ? collection.query.bind(collection) : async () => ({ items: [], hasMore: false }),
		};
	}
	return {
		async get() {
			return null;
		},
		async query() {
			return { items: [], hasMore: false };
		},
	};
}

export async function checkoutHandler(
	ctx: RouteContext<CheckoutInput>,
	paymentProviderId?: string,
) {
	requirePost(ctx);
	const resolvedPaymentProviderId = resolvePaymentProviderId(paymentProviderId);

	const nowMs = Date.now();
	const nowIso = new Date(nowMs).toISOString();

	const headerKey = ctx.request.headers.get("Idempotency-Key")?.trim() || undefined;
	const bodyKey = ctx.input.idempotencyKey?.trim() || undefined;

	if (headerKey && bodyKey && headerKey !== bodyKey) {
		throw PluginRouteError.badRequest(
			"Idempotency-Key conflict: header and body values must match when both are supplied",
		);
	}

	const idempotencyKey = bodyKey ?? headerKey;

	if (!validateIdempotencyKey(idempotencyKey)) {
		throw PluginRouteError.badRequest(
			"Idempotency-Key is required (header or body) and must be 16–128 printable ASCII characters",
		);
	}

	const ipHash = await buildRateLimitActorKey(ctx, "checkout");
	const allowed = await consumeKvRateLimit({
		kv: ctx.kv,
		keySuffix: `checkout:ip:${ipHash}`,
		limit: COMMERCE_LIMITS.defaultCheckoutPerIpPerWindow,
		windowMs: COMMERCE_LIMITS.defaultRateWindowMs,
		nowMs,
	});
	if (!allowed) {
		throwCommerceApiError({
			code: "RATE_LIMITED",
			message: "Too many checkout attempts; try again shortly",
		});
	}

	const carts = asCollection<StoredCart>(ctx.storage.carts);
	const orders = asCollection<StoredOrder>(ctx.storage.orders);
	const attempts = asCollection<StoredPaymentAttempt>(ctx.storage.paymentAttempts);
	const cart = await carts.get(ctx.input.cartId);
	if (!cart) {
		throwCommerceApiError({ code: "CART_NOT_FOUND", message: "Cart not found" });
	}
	await assertCartOwnerToken(cart, ctx.input.ownerToken, "checkout");
	if (cart.lineItems.length === 0) {
		throwCommerceApiError({ code: "CART_EMPTY", message: "Cart has no line items" });
	}
	if (cart.lineItems.length > COMMERCE_LIMITS.maxCartLineItems) {
		throwCommerceApiError({
			code: "PAYLOAD_TOO_LARGE",
			message: `Cart exceeds maximum of ${COMMERCE_LIMITS.maxCartLineItems} line items`,
		});
	}
	const lineItemValidationMessage = validateCartLineItems(cart.lineItems);
	if (lineItemValidationMessage) {
		throw PluginRouteError.badRequest(lineItemValidationMessage);
	}

	const fingerprint = cartContentFingerprint(cart.lineItems);
	const keyHash = await sha256HexAsync(
		`${CHECKOUT_ROUTE}|${ctx.input.cartId}|${cart.updatedAt}|${fingerprint}|${idempotencyKey}`,
	);
	const idempotencyDocId = `idemp:${keyHash}`;

	const idempotencyKeys = asCollection<StoredIdempotencyKey>(ctx.storage.idempotencyKeys);
	const lockCollection = asCollection<StoredIdempotencyKey>(ctx.storage.idempotencyKeys) as CheckoutLockCollection;
	assertAtomicMoneyPathSupport({
		path: "checkout",
		hasPutIfAbsent: typeof lockCollection.putIfAbsent === "function",
		hasCompareAndSwap: typeof lockCollection.compareAndSwap === "function",
	});
	const lockRequestId = buildCheckoutLockRequestId(idempotencyKey, nowIso);
	const lockDocId = await claimCheckoutCartLock({
		locks: lockCollection,
		cartId: ctx.input.cartId,
		requestId: lockRequestId,
		nowIso,
		nowMs,
		expiresMs: CHECKOUT_CART_LOCK_TTL_MS,
	});
	let responseBody: CheckoutResponse | undefined;
	let replayResponse:
		| ReturnType<typeof toCheckoutClientResponse>
		| null = null;
	const releaseLock = () =>
		releaseCheckoutCartLock({
			locks: lockCollection,
			lockId: lockDocId,
			requestId: lockRequestId,
		});
	try {
		// Return cached responses before creating new work so replay remains stable
		// if the cart already has a pending order from a partially complete attempt.
		const cached = await idempotencyKeys.get(idempotencyDocId);
		if (cached && isIdempotencyRecordFresh(cached.createdAt, nowMs)) {
			const decision = decideCheckoutReplayState(cached);
			switch (decision.kind) {
				case "cached_completed": {
					const cachedOrder = await orders.get(decision.response.orderId);
					const cachedAttempt = await attempts.get(decision.response.paymentAttemptId);
					if (
						!(await validateCachedCheckoutCompleted(
							keyHash,
							decision.response,
							cachedOrder,
							cachedAttempt,
						))
					) {
						break;
					}
					replayResponse = toCheckoutClientResponse(decision.response);
					break;
				}
				case "cached_pending":
					replayResponse = toCheckoutClientResponse(
						await restorePendingCheckout(
							idempotencyDocId,
							cached,
							decision.pending,
							nowIso,
							idempotencyKeys,
							orders,
							attempts,
						),
					);
					break;
				case "not_cached":
				default:
					break;
			}
		}

		if (replayResponse) {
			return replayResponse;
		}

		// Guard against duplicate checkouts when no lock is available (or after
		// stale locks are reclaimed): if any payment_pending order already exists
		// for this cart, treat this as a conflict.
		const openCheckout = await orders.query({
			where: { cartId: ctx.input.cartId, paymentPhase: "payment_pending" },
			limit: 1,
		});
		if (openCheckout.items.length > 0) {
			throwCommerceApiError({
				code: "ORDER_STATE_CONFLICT",
				message: "Cart already has an active checkout",
				details: {
					cartId: ctx.input.cartId,
					existingOrderId: openCheckout.items[0]?.id,
				},
			});
		}

		const inventoryStock = asCollection<StoredInventoryStock>(ctx.storage.inventoryStock);
		await validateLineItemsStockForCheckout(cart.lineItems, {
			products: asCollection(ctx.storage.products),
			bundleComponents: asCollection(ctx.storage.bundleComponents),
			productSkus: asCollection(ctx.storage.productSkus),
			inventoryStock,
		});

		let orderLineItems: OrderLineItem[];
		try {
			orderLineItems = mergeLineItemsBySku(projectCartLineItemsForStorage(cart.lineItems));
		} catch {
			throw PluginRouteError.badRequest(
				"Cart has duplicate SKUs with conflicting price or inventory version snapshots",
			);
		}

		const productSnapshots = await buildOrderLineSnapshots(orderLineItems, cart.currency, {
			products: asSnapshotCollection<StoredProduct>(ctx.storage.products),
			productSkus: asSnapshotCollection<StoredProductSku>(ctx.storage.productSkus),
			productSkuOptionValues: asSnapshotCollection<StoredProductSkuOptionValue>(
				ctx.storage.productSkuOptionValues,
			),
			productDigitalAssets: asSnapshotCollection<StoredDigitalAsset>(ctx.storage.digitalAssets),
			productDigitalEntitlements: asSnapshotCollection<StoredDigitalEntitlement>(ctx.storage.digitalEntitlements),
			productAssetLinks: asSnapshotCollection<StoredProductAssetLink>(ctx.storage.productAssetLinks),
			productAssets: asSnapshotCollection<StoredProductAsset>(ctx.storage.productAssets),
			bundleComponents: asSnapshotCollection<StoredBundleComponent>(ctx.storage.bundleComponents),
			inventoryStock: {
				get: (id: string) => inventoryStock.get(id),
			},
		});
		const orderLineItemsWithSnapshots = orderLineItems.map((line, index) => ({
			...line,
			snapshot: productSnapshots[index],
			unitPriceMinor: productSnapshots[index]?.unitPriceMinor ?? line.unitPriceMinor,
		}));

		const totalMinor = orderLineItemsWithSnapshots.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
		const orderId = deterministicOrderId(keyHash);

		const finalizeToken = await randomHex(24);
		const finalizeTokenHash = await sha256HexAsync(finalizeToken);

		const order: StoredOrder = {
			cartId: ctx.input.cartId,
			paymentPhase: "payment_pending",
			currency: cart.currency,
			lineItems: orderLineItemsWithSnapshots,
			totalMinor,
			finalizeTokenHash,
			createdAt: nowIso,
			updatedAt: nowIso,
		};

		const paymentAttemptId = deterministicPaymentAttemptId(keyHash);
		const attempt: StoredPaymentAttempt = {
			orderId,
			providerId: resolvedPaymentProviderId,
			status: "pending",
			createdAt: nowIso,
			updatedAt: nowIso,
		};

		const pendingState: CheckoutPendingState = {
			kind: CHECKOUT_PENDING_KIND,
			orderId,
			paymentAttemptId,
			providerId: resolvedPaymentProviderId,
			cartId: ctx.input.cartId,
			paymentPhase: "payment_pending",
			finalizeToken,
			totalMinor,
			currency: cart.currency,
			lineItems: orderLineItemsWithSnapshots,
			createdAt: nowIso,
		};

		await idempotencyKeys.put(idempotencyDocId, {
			route: CHECKOUT_ROUTE,
			keyHash,
			httpStatus: 202,
			responseBody: pendingState,
			createdAt: nowIso,
		});

		await orders.put(orderId, order);
		await attempts.put(paymentAttemptId, attempt);

		responseBody = {
			orderId,
			paymentPhase: "payment_pending",
			paymentAttemptId,
			totalMinor,
			currency: cart.currency,
			finalizeToken,
		};
		const replayIntegrity = await computeCheckoutReplayIntegrity(keyHash, responseBody);
		await idempotencyKeys.put(idempotencyDocId, {
			route: CHECKOUT_ROUTE,
			keyHash,
			httpStatus: 200,
			responseBody: { ...responseBody, replayIntegrity },
			createdAt: nowIso,
		});
	} finally {
		await releaseLock();
	}

	if (!responseBody) {
		throwCommerceApiError({
			code: "ORDER_STATE_CONFLICT",
			message: "Checkout flow was interrupted before creating an order",
			details: { cartId: ctx.input.cartId },
		});
	}
	return responseBody;
}
