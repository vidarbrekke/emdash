import { describe, expect, it } from "vitest";

import type { RouteContext } from "emdash";
import {
	COMMERCE_SETTINGS_MATRIX,
	COMMERCE_SETTINGS_PROFILE_REQUIREMENTS,
	isValidDefaultCurrency,
	resolveCommerceSettingsProfile,
	resolveWebhookCommerceSettings,
} from "./settings-validation.js";

const createKvContext = (values: Record<string, unknown>): RouteContext<unknown> => {
	return {
		kv: {
			get: async (key: string) => (values[key] ?? null) as unknown,
		},
	} as RouteContext<unknown>;
};

describe("commerce settings validation matrix", () => {
	it("keeps profile requirements aligned with matrix entries", () => {
		const profileSettings = new Set(COMMERCE_SETTINGS_MATRIX.map((entry) => entry.name));
		const requiredSettings = new Set(COMMERCE_SETTINGS_PROFILE_REQUIREMENTS.all);
		for (const entry of COMMERCE_SETTINGS_PROFILE_REQUIREMENTS.webhook) {
			expect(profileSettings.has(entry)).toBe(true);
		}
		for (const entry of requiredSettings) {
			expect(profileSettings.has(entry)).toBe(true);
		}
	});

	it("rejects webhook settings when webhook secret is missing", async () => {
		const ctx = createKvContext({});
		await expect(resolveWebhookCommerceSettings(ctx)).rejects.toMatchObject({
			code: "provider_unavailable",
			message: expect.stringContaining("stripeWebhookSecret is required"),
		});
	});

	it("rejects webhook settings when webhook secret is malformed", async () => {
		const ctx = createKvContext({
			"settings:stripeWebhookSecret": "invalid-secret",
		});
		await expect(resolveWebhookCommerceSettings(ctx)).rejects.toMatchObject({
			code: "provider_unavailable",
			message: expect.stringContaining("Stripe webhook secret must start with whsec_"),
		});
	});

	it("accepts a valid webhook secret", async () => {
		const ctx = createKvContext({
			"settings:stripeWebhookSecret": "whsec_test_valid",
		});
		await expect(resolveWebhookCommerceSettings(ctx)).resolves.toEqual({
			stripeWebhookSecret: "whsec_test_valid",
		});
	});
});

describe("payment provider settings validation", () => {
	const defaultSettings = {
		"settings:stripePublishableKey": "pk_test_1234567890",
		"settings:stripeSecretKey": "sk_test_1234567890",
		"settings:defaultCurrency": "USD",
	};

	it("rejects partial payment-provider config with missing required keys", async () => {
		const ctx = createKvContext(defaultSettings);
		const partialCtx = createKvContext({
			...defaultSettings,
			"settings:stripeSecretKey": undefined,
		});

		await expect(resolveCommerceSettingsProfile(ctx, "payment-provider")).resolves.toEqual({
			stripePublishableKey: "pk_test_1234567890",
			stripeSecretKey: "sk_test_1234567890",
			defaultCurrency: "USD",
		});

		await expect(resolveCommerceSettingsProfile(partialCtx, "payment-provider")).rejects.toMatchObject({
			code: "provider_unavailable",
			message: expect.stringContaining("stripeSecretKey is required"),
		});
	});

	it("rejects malformed payment-provider values", async () => {
		const malformedPublishable = createKvContext({
			...defaultSettings,
			"settings:stripePublishableKey": "pk_wrong_",
			"settings:stripeSecretKey": "sk_test_1234567890",
		});
		await expect(resolveCommerceSettingsProfile(malformedPublishable, "payment-provider")).rejects.toMatchObject({
			code: "provider_unavailable",
			message: expect.stringContaining("Stripe publishable key must start with"),
		});

		const malformedSecret = createKvContext({
			...defaultSettings,
			"settings:stripePublishableKey": "pk_test_1234567890",
			"settings:stripeSecretKey": "bad_secret",
		});
		await expect(resolveCommerceSettingsProfile(malformedSecret, "payment-provider")).rejects.toMatchObject({
			code: "provider_unavailable",
			message: expect.stringContaining("Stripe secret key must start with"),
		});

		const malformedCurrency = createKvContext({
			...defaultSettings,
			"settings:defaultCurrency": "us-d",
		});
		await expect(resolveCommerceSettingsProfile(malformedCurrency, "payment-provider")).rejects.toMatchObject({
			code: "provider_unavailable",
			message: expect.stringContaining("ISO-4217"),
		});
	});
});

describe("currency helper", () => {
	it("accepts only strict ISO-4217 style currency values", () => {
		expect(isValidDefaultCurrency("USD")).toBe(true);
		expect(isValidDefaultCurrency("eur")).toBe(false);
		expect(isValidDefaultCurrency("US")).toBe(false);
		expect(isValidDefaultCurrency("USDD")).toBe(false);
	});
});

