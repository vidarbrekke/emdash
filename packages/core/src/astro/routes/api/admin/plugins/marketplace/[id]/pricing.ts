/**
 * Marketplace plugin pricing endpoint
 *
 * POST /_emdash/api/admin/plugins/marketplace/:id/pricing
 *
 * Returns a short-lived install token that must be submitted to
 * /marketplace/:id/confirm before installation can proceed.
 */

import type { APIRoute } from "astro";
import { z } from "zod";

import { requirePerm } from "#api/authorize.js";
import { apiError, handleError, unwrapResult } from "#api/error.js";
import { handleMarketplacePricing } from "#api/index.js";
import { isParseError, parseOptionalBody } from "#api/parse.js";

export const prerender = false;

const pricingBodySchema = z.object({
	version: z.string().min(1).optional(),
});

export const POST: APIRoute = async ({ params, request, locals }) => {
	try {
		const { emdash, user } = locals;
		const { id } = params;

		if (!emdash?.db) {
			return apiError("NOT_CONFIGURED", "EmDash is not initialized", 500);
		}

		const denied = requirePerm(user, "plugins:manage");
		if (denied) return denied;

		if (!id) {
			return apiError("INVALID_REQUEST", "Plugin ID required", 400);
		}

		const body = await parseOptionalBody(request, pricingBodySchema, {});
		if (isParseError(body)) return body;

		const configuredPluginIds = new Set<string>(emdash.configuredPlugins.map((p) => p.id));

		const result = await handleMarketplacePricing(emdash.db, emdash.config.marketplace, id, {
			version: body.version,
			configuredPluginIds,
		});

		return unwrapResult(result);
	} catch (error) {
		console.error("[marketplace-pricing] Unhandled error:", error);
		return handleError(error, "Failed to prepare plugin install", "PRICING_FAILED");
	}
};
