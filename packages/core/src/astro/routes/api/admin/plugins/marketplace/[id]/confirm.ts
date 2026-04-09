/**
 * Confirm marketplace plugin installation
 *
 * POST /_emdash/api/admin/plugins/marketplace/:id/confirm
 */

import type { APIRoute } from "astro";
import { z } from "zod";

import { requirePerm } from "#api/authorize.js";
import { apiError, handleError, unwrapResult } from "#api/error.js";
import { handleMarketplaceInstallConfirm } from "#api/index.js";
import { isParseError, parseBody } from "#api/parse.js";

export const prerender = false;

const confirmBodySchema = z.object({
	installToken: z.string().min(1),
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

		const body = await parseBody(request, confirmBodySchema);
		if (isParseError(body)) return body;

		const configuredPluginIds = new Set<string>(emdash.configuredPlugins.map((p) => p.id));

		const result = await handleMarketplaceInstallConfirm(
			emdash.db,
			emdash.storage,
			emdash.getSandboxRunner(),
			emdash.config.marketplace,
			id,
			{ installToken: body.installToken, configuredPluginIds },
		);
		if (!result.success) return unwrapResult(result);

		await emdash.syncMarketplacePlugins();
		return unwrapResult(result, 201);
	} catch (error) {
		console.error("[marketplace-install-confirm] Unhandled error:", error);
		return handleError(error, "Failed to install plugin from marketplace", "INSTALL_FAILED");
	}
};
