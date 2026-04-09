export const CHECKOUT_GET_ORDER_RESPONSE_KEYS = [
	"cartId",
	"createdAt",
	"currency",
	"lineItems",
	"paymentPhase",
	"totalMinor",
	"updatedAt",
] as const;

export const CHECKOUT_CLIENT_RESPONSE_KEYS = [
	"orderId",
	"paymentAttemptId",
	"paymentPhase",
	"totalMinor",
	"currency",
	"finalizeToken",
] as const;

export const CATALOG_STOREFRONT_LIST_ITEM_KEYS = [
	"availability",
	"categories",
	"galleryImages",
	"lowStockSkuCount",
	"primaryImage",
	"priceRange",
	"product",
	"tags",
] as const;

export const CATALOG_STOREFRONT_LIST_ITEM_PRODUCT_KEYS = [
	"brand",
	"bundleDiscountType",
	"bundleDiscountValueBps",
	"bundleDiscountValueMinor",
	"createdAt",
	"id",
	"featured",
	"requiresShippingDefault",
	"shortDescription",
	"sortOrder",
	"status",
	"taxClassDefault",
	"title",
	"type",
	"updatedAt",
	"vendor",
	"visibility",
	"slug",
] as const;

export const CATALOG_ADMIN_PRODUCT_KEYS = ["categories", "product", "skus", "tags"] as const;

export const CATALOG_ADMIN_PRODUCT_PRODUCT_KEYS = [
	"bundleDiscountType",
	"bundleDiscountValueBps",
	"bundleDiscountValueMinor",
	"brand",
	"createdAt",
	"currentSlug",
	"featured",
	"id",
	"longDescription",
	"metadataJson",
	"requiresShippingDefault",
	"shortDescription",
	"slug",
	"sortOrder",
	"status",
	"taxClassDefault",
	"title",
	"type",
	"updatedAt",
	"vendor",
	"visibility",
] as const;
