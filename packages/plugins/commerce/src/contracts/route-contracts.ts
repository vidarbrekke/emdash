import {
	cartGetInputSchema,
	cartUpsertInputSchema,
	productAssetLinkInputSchema,
	productAssetReorderInputSchema,
	productAssetRegisterInputSchema,
	productAssetUnlinkInputSchema,
	bundleComputeInputSchema,
	bundleComponentAddInputSchema,
	bundleComponentRemoveInputSchema,
	bundleComponentReorderInputSchema,
	categoryCreateInputSchema,
	categoryListInputSchema,
	digitalAssetCreateInputSchema,
	digitalEntitlementCreateInputSchema,
	digitalEntitlementRemoveInputSchema,
	productCategoryLinkInputSchema,
	productCategoryUnlinkInputSchema,
	productCreateInputSchema,
	productGetBySlugInputSchema,
	productGetInputSchema,
	productListInputSchema,
	productSkuCreateInputSchema,
	productSkuListInputSchema,
	productSkuStateInputSchema,
	productSkuUpdateInputSchema,
	productStateInputSchema,
	productUpdateInputSchema,
	checkoutGetOrderInputSchema,
	checkoutInputSchema,
	tagCreateInputSchema,
	tagListInputSchema,
	productTagLinkInputSchema,
	productTagUnlinkInputSchema,
	recommendationsInputSchema,
	stripeWebhookInputSchema,
} from "../schemas.js";

export type CommerceRouteMethod = "POST";

export type CommerceRouteReplayStrategy = "none" | "idempotency_key" | "webhook_event";

type CommerceRouteFixtureSet = {
	readonly valid?: readonly unknown[];
	readonly invalid?: readonly unknown[];
	readonly replay?: readonly unknown[];
};

export type CommerceRouteContract = {
	readonly public: boolean;
	readonly method: CommerceRouteMethod;
	readonly requiresKV: boolean;
	readonly requiresFetch: boolean;
	readonly replay: CommerceRouteReplayStrategy;
	readonly inputSchema: unknown;
	readonly responseSchema?: unknown;
	readonly sideEffectful?: true;
	readonly requiresIdempotencyKey?: true;
	readonly mutationCollections?: readonly string[];
	readonly orderedChildSensitivity?: true;
	readonly entitlementAware?: true;
	readonly fixtures?: CommerceRouteFixtureSet;
};

export type CommerceRouteContracts = {
	"cart/upsert": CommerceRouteContract;
	"cart/get": CommerceRouteContract;
	"bundle/compute": CommerceRouteContract;
	"catalog/product/get": CommerceRouteContract;
	"catalog/product/get-by-slug": CommerceRouteContract;
	"catalog/category/list": CommerceRouteContract;
	"catalog/tag/list": CommerceRouteContract;
	"catalog/products": CommerceRouteContract;
	"catalog/sku/list": CommerceRouteContract;
	"checkout": CommerceRouteContract;
	"checkout/get-order": CommerceRouteContract;
	"recommendations": CommerceRouteContract;
	"webhooks/stripe": CommerceRouteContract;
	"admin/catalog/product/get": CommerceRouteContract;
	"product-assets/register": CommerceRouteContract;
	"catalog/asset/link": CommerceRouteContract;
	"catalog/asset/unlink": CommerceRouteContract;
	"catalog/asset/reorder": CommerceRouteContract;
	"bundle-components/add": CommerceRouteContract;
	"bundle-components/remove": CommerceRouteContract;
	"bundle-components/reorder": CommerceRouteContract;
	"digital-assets/create": CommerceRouteContract;
	"digital-entitlements/create": CommerceRouteContract;
	"digital-entitlements/remove": CommerceRouteContract;
	"catalog/product/create": CommerceRouteContract;
	"catalog/product/update": CommerceRouteContract;
	"catalog/product/state": CommerceRouteContract;
	"catalog/category/create": CommerceRouteContract;
	"catalog/category/link": CommerceRouteContract;
	"catalog/category/unlink": CommerceRouteContract;
	"catalog/tag/create": CommerceRouteContract;
	"catalog/tag/link": CommerceRouteContract;
	"catalog/tag/unlink": CommerceRouteContract;
	"admin/catalog/products": CommerceRouteContract;
	"catalog/sku/create": CommerceRouteContract;
	"catalog/sku/update": CommerceRouteContract;
	"catalog/sku/state": CommerceRouteContract;
	"admin/catalog/sku/list": CommerceRouteContract;
};

type RouteCapabilityMetadata = {
	requiresKV?: true;
	requiresFetch?: true;
};

type CommerceRouteCapabilityMap = {
	[key in keyof CommerceRouteContracts]?: RouteCapabilityMetadata;
};

export const COMMERCE_ROUTE_CONTRACTS = {
	"cart/upsert": {
		public: true,
		method: "POST",
		requiresKV: true,
		requiresFetch: false,
		replay: "none",
		inputSchema: cartUpsertInputSchema,
		sideEffectful: true,
		mutationCollections: ["carts"],
	},
	"cart/get": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: cartGetInputSchema,
	},
	"bundle/compute": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: bundleComputeInputSchema,
	},
	"catalog/product/get": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productGetInputSchema,
	},
	"catalog/product/get-by-slug": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productGetBySlugInputSchema,
	},
	"catalog/category/list": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: categoryListInputSchema,
	},
	"catalog/tag/list": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: tagListInputSchema,
	},
	"catalog/products": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productListInputSchema,
	},
	"catalog/sku/list": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productSkuListInputSchema,
	},
	"checkout": {
		public: true,
		method: "POST",
		requiresKV: true,
		requiresFetch: false,
		replay: "idempotency_key",
		inputSchema: checkoutInputSchema,
		sideEffectful: true,
		requiresIdempotencyKey: true,
		mutationCollections: ["carts", "orders", "paymentAttempts", "idempotencyKeys", "webhookReceipts"],
		orderedChildSensitivity: true,
		fixtures: {
			valid: [{ cartId: "cart-1", ownerToken: "owner-token-123456" }],
			invalid: [{ cartId: "", ownerToken: "short" }],
			replay: [{ cartId: "cart-1", ownerToken: "owner-token-123456", idempotencyKey: "idem-route-16chars" }],
		},
	},
	"checkout/get-order": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: checkoutGetOrderInputSchema,
	},
	"recommendations": {
		public: true,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: recommendationsInputSchema,
	},
	"webhooks/stripe": {
		public: true,
		method: "POST",
		requiresKV: true,
		requiresFetch: false,
		replay: "webhook_event",
		inputSchema: stripeWebhookInputSchema,
		sideEffectful: true,
		mutationCollections: ["orders", "paymentAttempts", "webhookReceipts"],
		orderedChildSensitivity: true,
		fixtures: {
			valid: [
				{
					id: "evt_1",
					type: "payment_intent.succeeded",
					data: {
						object: {
							id: "pi_1",
							metadata: { orderId: "ord_1" },
						},
					},
				},
			],
			invalid: [{}],
			replay: [
				{
					id: "evt_1",
					type: "payment_intent.succeeded",
					data: {
						object: { id: "pi_1", metadata: { orderId: "ord_1" } },
					},
				},
			],
		},
	},
	"admin/catalog/product/get": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productGetInputSchema,
	},
	"product-assets/register": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productAssetRegisterInputSchema,
	},
	"catalog/asset/link": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productAssetLinkInputSchema,
	},
	"catalog/asset/unlink": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productAssetUnlinkInputSchema,
	},
	"catalog/asset/reorder": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productAssetReorderInputSchema,
	},
	"bundle-components/add": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: bundleComponentAddInputSchema,
	},
	"bundle-components/remove": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: bundleComponentRemoveInputSchema,
	},
	"bundle-components/reorder": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: bundleComponentReorderInputSchema,
	},
	"digital-assets/create": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: digitalAssetCreateInputSchema,
	},
	"digital-entitlements/create": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: digitalEntitlementCreateInputSchema,
	},
	"digital-entitlements/remove": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: digitalEntitlementRemoveInputSchema,
	},
	"catalog/product/create": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productCreateInputSchema,
	},
	"catalog/product/update": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productUpdateInputSchema,
	},
	"catalog/product/state": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productStateInputSchema,
	},
	"catalog/category/create": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: categoryCreateInputSchema,
	},
	"catalog/category/link": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productCategoryLinkInputSchema,
	},
	"catalog/category/unlink": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productCategoryUnlinkInputSchema,
	},
	"catalog/tag/create": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: tagCreateInputSchema,
	},
	"catalog/tag/link": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productTagLinkInputSchema,
	},
	"catalog/tag/unlink": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productTagUnlinkInputSchema,
	},
	"admin/catalog/products": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productListInputSchema,
	},
	"catalog/sku/create": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productSkuCreateInputSchema,
	},
	"catalog/sku/update": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productSkuUpdateInputSchema,
	},
	"catalog/sku/state": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productSkuStateInputSchema,
	},
	"admin/catalog/sku/list": {
		public: false,
		method: "POST",
		requiresKV: false,
		requiresFetch: false,
		replay: "none",
		inputSchema: productSkuListInputSchema,
	},
} as const satisfies CommerceRouteContracts;

export const COMMERCE_BASE_MANIFEST_CAPABILITIES = ["storage:kv", "cron:schedule", "admin:ui"] as const;

export type CommerceManifestCapability = (typeof COMMERCE_BASE_MANIFEST_CAPABILITIES)[number] | "network:fetch";

export const COMMERCE_ROUTE_CAPABILITIES: CommerceRouteCapabilityMap = Object.fromEntries(
	Object.entries(COMMERCE_ROUTE_CONTRACTS)
		.filter(([, contract]) => contract.requiresKV || contract.requiresFetch)
		.map(([route, contract]) => [
			route,
			{
				...(contract.requiresKV ? { requiresKV: true } : {}),
				...(contract.requiresFetch ? { requiresFetch: true } : {}),
			},
		]),
) as CommerceRouteCapabilityMap;

function hasFetchCapabilityRequirement(): boolean {
	return Object.values(COMMERCE_ROUTE_CAPABILITIES).some((capability) => capability?.requiresFetch);
}

export const COMMERCE_MANIFEST_CAPABILITIES = [
	...COMMERCE_BASE_MANIFEST_CAPABILITIES,
	...(hasFetchCapabilityRequirement() ? (["network:fetch"] as const) : ([] as const)),
] as const satisfies readonly CommerceManifestCapability[];

