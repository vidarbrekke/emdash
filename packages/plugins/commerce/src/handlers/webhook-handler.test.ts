import { beforeEach, describe, expect, it, vi } from "vitest";

const finalizePaymentFromWebhook = vi.fn();
const consumeKvRateLimit = vi.fn(async (_opts?: unknown) => true);

vi.mock("../orchestration/finalize-payment.js", () => ({
	__esModule: true,
	finalizePaymentFromWebhook: (...args: unknown[]) => finalizePaymentFromWebhook(...args),
}));
vi.mock("../lib/rate-limit-kv.js", () => ({
	__esModule: true,
	consumeKvRateLimit: (opts: unknown) => consumeKvRateLimit(opts),
}));

import { createPaymentWebhookRoute } from "../services/commerce-extension-seams.js";
import type { handlePaymentWebhook } from "./webhook-handler.js";

describe("payment webhook seam", () => {
	beforeEach(() => {
		finalizePaymentFromWebhook.mockReset();
		consumeKvRateLimit.mockReset();
		consumeKvRateLimit.mockResolvedValue(true);
	});

	function ctx(): Parameters<typeof handlePaymentWebhook>[0] {
		return {
			request: new Request("https://example.test/webhooks/stripe", {
				method: "POST",
				body: JSON.stringify({
					orderId: "order_1",
					externalEventId: "evt_1",
					finalizeToken: "tok",
				}),
				headers: { "content-length": "57" },
			}),
			input: { orderId: "order_1", externalEventId: "evt_1", finalizeToken: "tok" },
			storage: {
				orders: {} as never,
				webhookReceipts: {} as never,
				paymentAttempts: {} as never,
				inventoryLedger: {} as never,
				inventoryStock: {} as never,
			},
			kv: {} as never,
			requestMeta: { ip: "127.0.0.1" },
			log: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
				debug: () => undefined,
			},
		} as never;
	}

	const adapter = {
		providerId: "stripe",
		verifyRequest: vi.fn(async () => undefined),
		buildFinalizeInput: vi.fn(() => ({
			orderId: "order_1",
			externalEventId: "evt_1",
			finalizeToken: "tok",
		})),
		buildCorrelationId: vi.fn(() => "corr:evt_1"),
		buildRateLimitSuffix: vi.fn(() => "stripe:ip"),
	};

	it("adapts provider input and delegates to finalize-payment", async () => {
		finalizePaymentFromWebhook.mockResolvedValue({
			kind: "completed",
			orderId: "order_1",
		});

		const out = await createPaymentWebhookRoute(adapter)(ctx());

		expect(adapter.verifyRequest).toHaveBeenCalledTimes(1);
		expect(adapter.buildFinalizeInput).toHaveBeenCalledTimes(1);
		expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(1);
		expect(finalizePaymentFromWebhook).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				orderId: "order_1",
				externalEventId: "evt_1",
				finalizeToken: "tok",
				providerId: "stripe",
				correlationId: "corr:evt_1",
			}),
		);
		expect(out).toEqual({ ok: true, replay: false, orderId: "order_1" });
	});

it("rejects adapters with a missing provider id", async () => {
	const malformedAdapter = {
		...adapter,
		providerId: "",
	};

	await expect(createPaymentWebhookRoute(malformedAdapter as never)(ctx())).rejects.toMatchObject({
		code: "provider_unavailable",
		message: expect.stringContaining("providerId"),
	});
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(0);
});

it("rejects adapters with non-function provider hooks", async () => {
	const malformedAdapter = {
		...adapter,
		verifyRequest: 0 as never,
	};

	await expect(createPaymentWebhookRoute(malformedAdapter as never)(ctx())).rejects.toMatchObject({
		code: "provider_unavailable",
		message: expect.stringContaining("missing required method"),
	});
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(0);
});

it("rejects adapters returning malformed finalize input", async () => {
	const malformedAdapter = {
		...adapter,
		buildFinalizeInput: vi.fn(
			() =>
				({
					orderId: "order_1",
					externalEventId: "evt_1",
				}) as never,
		),
	};

	await expect(createPaymentWebhookRoute(malformedAdapter as never)(ctx())).rejects.toMatchObject({
		code: "provider_unavailable",
		message: expect.stringContaining("invalid field types"),
	});
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(0);
});

it("rejects adapters returning empty finalize input fields", async () => {
	const malformedAdapter = {
		...adapter,
		buildFinalizeInput: vi.fn(
			() =>
				({
					orderId: "",
					externalEventId: "evt_1",
					finalizeToken: "tok",
				}) as never,
		),
	};

	await expect(createPaymentWebhookRoute(malformedAdapter as never)(ctx())).rejects.toMatchObject({
		code: "provider_unavailable",
		message: expect.stringContaining("empty finalize input fields"),
	});
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(0);
});

	it("rejects non-POST webhook requests", async () => {
		await expect(
			createPaymentWebhookRoute(adapter)({
				...(ctx() as ReturnType<typeof ctx>),
				request: new Request("https://example.test/webhooks/stripe", { method: "GET" }),
			} as never),
		).rejects.toMatchObject({ code: "method_not_allowed" });
	});

	it("rejects oversized webhook payload by header cap", async () => {
		await expect(
			createPaymentWebhookRoute(adapter)({
				...(ctx() as ReturnType<typeof ctx>),
				request: new Request("https://example.test/webhooks/stripe", {
					method: "POST",
					body: "{}",
					headers: { "content-length": `${Number.MAX_SAFE_INTEGER}` },
				}),
			} as never),
		).rejects.toMatchObject({ code: "payload_too_large" });
	});

it("still runs verifyRequest when content-length is malformed but payload is bounded", async () => {
	const body = JSON.stringify({
		orderId: "order_1",
		externalEventId: "evt_1",
		finalizeToken: "tok",
	});
	let observedBody = "";
	const localAdapter = {
		...adapter,
		verifyRequest: vi.fn(async (hookCtx: any) => {
			observedBody = await hookCtx.request.clone().text();
		}),
	};
	finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });

	const out = await createPaymentWebhookRoute(localAdapter)({
		...(ctx() as ReturnType<typeof ctx>),
		request: new Request("https://example.test/webhooks/stripe", {
			method: "POST",
			body,
			headers: { "content-length": "not-a-number" },
		}),
	} as never);

	expect(observedBody).toBe(body);
	expect(localAdapter.verifyRequest).toHaveBeenCalledTimes(1);
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(1);
	expect(out).toEqual({ ok: true, replay: false, orderId: "order_1" });
});

it("does not run verifyRequest when malformed content-length payload is oversized", async () => {
	const bigBody = "x".repeat(65_537);
	const localAdapter = {
		...adapter,
		verifyRequest: vi.fn(async () => undefined),
	};

	await expect(
		createPaymentWebhookRoute(localAdapter)({
			...(ctx() as ReturnType<typeof ctx>),
			request: new Request("https://example.test/webhooks/stripe", {
				method: "POST",
				body: bigBody,
				headers: { "content-length": "not-a-number" },
			}),
		} as never),
	).rejects.toMatchObject({ code: "payload_too_large" });

	expect(localAdapter.verifyRequest).toHaveBeenCalledTimes(0);
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(0);
});

	it("rejects oversized webhook payload when content-length is missing or malformed", async () => {
		const bigBody = "x".repeat(65_537);
		await expect(
			createPaymentWebhookRoute(adapter)({
				...(ctx() as ReturnType<typeof ctx>),
				request: new Request("https://example.test/webhooks/stripe", {
					method: "POST",
					body: bigBody,
					headers: { "content-length": "not-a-number" },
				}),
			} as never),
		).rejects.toMatchObject({ code: "payload_too_large" });
	});

	it("enforces webhook rate limit", async () => {
		consumeKvRateLimit.mockResolvedValueOnce(false);
		await expect(createPaymentWebhookRoute(adapter)(ctx())).rejects.toMatchObject({
			code: "rate_limited",
		});
		expect(consumeKvRateLimit).toHaveBeenCalledTimes(1);
	});

	it("allows a retry after a failed rate-limited in-flight finalization", async () => {
		consumeKvRateLimit.mockResolvedValueOnce(false);
		await expect(createPaymentWebhookRoute(adapter)(ctx())).rejects.toMatchObject({ code: "rate_limited" });
		expect(consumeKvRateLimit).toHaveBeenCalledTimes(1);
		expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(0);

		consumeKvRateLimit.mockResolvedValueOnce(true);
		finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });
		const success = await createPaymentWebhookRoute(adapter)(ctx());

		expect(success).toEqual({ ok: true, replay: false, orderId: "order_1" });
		expect(consumeKvRateLimit).toHaveBeenCalledTimes(2);
		expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(1);
	});

it("propagates malformed rate-limit suffix values to rate limiter input", async () => {
	const malformedSuffix = "stripe\n:ip\0";
	const localAdapter = {
		...adapter,
		buildRateLimitSuffix: vi.fn(() => malformedSuffix),
	};

	finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });
	await createPaymentWebhookRoute(localAdapter)(ctx());

	expect(localAdapter.buildRateLimitSuffix).toHaveBeenCalledTimes(1);
	expect(consumeKvRateLimit).toHaveBeenCalledTimes(1);
	expect(consumeKvRateLimit).toHaveBeenCalledWith(
		expect.objectContaining({
			keySuffix: expect.stringContaining(`webhook:${malformedSuffix}:`),
		}),
	);
});

it("dedupes concurrent duplicate webhook deliveries", async () => {
	let resolveFinalize!: () => void;
	const finalizePromise = new Promise<{ kind: "completed"; orderId: string }>((resolve) => {
		resolveFinalize = () => resolve({ kind: "completed", orderId: "order_1" });
	});
	finalizePaymentFromWebhook.mockReturnValue(finalizePromise);

	const first = createPaymentWebhookRoute(adapter)(ctx());
	const second = createPaymentWebhookRoute(adapter)(ctx());
	const all = Promise.all([first, second]);

	resolveFinalize();
	const [firstResult, secondResult] = await all;
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(1);
	expect(firstResult).toEqual({ ok: true, replay: false, orderId: "order_1" });
	expect(secondResult).toEqual({ ok: true, replay: false, orderId: "order_1" });
});

it("retries dedupe entry after a failed in-flight webhook finalization", async () => {
	finalizePaymentFromWebhook.mockRejectedValueOnce(new Error("temporary transport failure"));
	await expect(Promise.all([createPaymentWebhookRoute(adapter)(ctx()), createPaymentWebhookRoute(adapter)(ctx())]))
		.rejects.toThrow("temporary transport failure");
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(1);

	finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });
	const success = await createPaymentWebhookRoute(adapter)(ctx());
	expect(success).toEqual({ ok: true, replay: false, orderId: "order_1" });
	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(2);
});

it("does not dedupe separate finalization attempts with different tokens", async () => {
	const localAdapter = {
		...adapter,
		buildFinalizeInput: vi.fn()
			.mockImplementationOnce(() => ({
				orderId: "order_1",
				externalEventId: "evt_1",
				finalizeToken: "tok_first",
			}))
			.mockImplementationOnce(() => ({
				orderId: "order_1",
				externalEventId: "evt_1",
				finalizeToken: "tok_second",
			})),
		buildCorrelationId: vi.fn(() => "corr:evt_1"),
	};

	finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });
	const handler = createPaymentWebhookRoute(localAdapter);

	await Promise.all([handler(ctx()), handler(ctx())]);

	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(2);
	expect(localAdapter.buildFinalizeInput).toHaveBeenCalledTimes(2);
	const finalizeInputTokens = finalizePaymentFromWebhook.mock.calls.map(([_, input]) => input.finalizeToken);
	expect(new Set(finalizeInputTokens)).toEqual(new Set(["tok_first", "tok_second"]));
});

it("does not dedupe separate finalization attempts with different order IDs", async () => {
	const localAdapter = {
		...adapter,
		buildFinalizeInput: vi.fn()
			.mockImplementationOnce(() => ({
				orderId: "order_1",
				externalEventId: "evt_shared",
				finalizeToken: "tok_1",
			}))
			.mockImplementationOnce(() => ({
				orderId: "order_2",
				externalEventId: "evt_shared",
				finalizeToken: "tok_1",
			})),
		buildCorrelationId: vi.fn(() => "corr:evt_shared"),
	};

	finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });
	const handler = createPaymentWebhookRoute(localAdapter);

	await Promise.all([handler(ctx()), handler(ctx())]);

	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(2);
	const finalizeInputOrderIds = finalizePaymentFromWebhook.mock.calls.map(([_, input]) => input.orderId);
	expect(new Set(finalizeInputOrderIds)).toEqual(new Set(["order_1", "order_2"]));
});

it("does not dedupe separate finalization attempts with different external event IDs", async () => {
	const localAdapter = {
		...adapter,
		buildFinalizeInput: vi.fn()
			.mockImplementationOnce(() => ({
				orderId: "order_1",
				externalEventId: "evt_1",
				finalizeToken: "tok_1",
			}))
			.mockImplementationOnce(() => ({
				orderId: "order_1",
				externalEventId: "evt_2",
				finalizeToken: "tok_1",
			})),
		buildCorrelationId: vi.fn(() => "corr:evt"),
	};

	finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });
	const handler = createPaymentWebhookRoute(localAdapter);

	await Promise.all([handler(ctx()), handler(ctx())]);

	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(2);
	const finalizeEventIds = finalizePaymentFromWebhook.mock.calls.map(([_, input]) => input.externalEventId);
	expect(new Set(finalizeEventIds)).toEqual(new Set(["evt_1", "evt_2"]));
});

it("does not dedupe separate finalization attempts across providers", async () => {
	const stripeAdapter = {
		...adapter,
		providerId: "stripe",
		buildFinalizeInput: vi.fn(() => ({
			orderId: "order_1",
			externalEventId: "evt_1",
			finalizeToken: "tok_1",
		})),
		buildCorrelationId: vi.fn(() => "corr:evt_1"),
		buildRateLimitSuffix: vi.fn(() => "stripe:ip"),
	};

	const paymentAdapter = {
		...adapter,
		providerId: "payment_foo",
		buildFinalizeInput: vi.fn(() => ({
			orderId: "order_1",
			externalEventId: "evt_1",
			finalizeToken: "tok_1",
		})),
		buildCorrelationId: vi.fn(() => "corr:evt_1"),
		buildRateLimitSuffix: vi.fn(() => "payment_foo:ip"),
	};

	finalizePaymentFromWebhook.mockResolvedValue({ kind: "completed", orderId: "order_1" });
	const stripeHandler = createPaymentWebhookRoute(stripeAdapter);
	const paymentHandler = createPaymentWebhookRoute(paymentAdapter);
	const stripeCtx = ctx();
	const paymentCtx = ctx();

	await Promise.all([stripeHandler(stripeCtx), paymentHandler(paymentCtx)]);

	expect(finalizePaymentFromWebhook).toHaveBeenCalledTimes(2);
	expect(stripeAdapter.buildFinalizeInput).toHaveBeenCalledTimes(1);
	expect(paymentAdapter.buildFinalizeInput).toHaveBeenCalledTimes(1);
});

});
