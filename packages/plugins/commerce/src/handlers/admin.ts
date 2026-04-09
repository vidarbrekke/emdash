import type { RouteContext } from "emdash/plugin";

import type { CommerceAdminInteraction } from "../schemas.js";

const PAGE_BLOCKS: Record<string, Array<Record<string, unknown>>> = {
	"/products": [
		{ type: "header", text: "Products" },
		{
			type: "section",
			text: "Product catalog administration, SKU management, and variant workflows will appear here.",
		},
	],
	"/orders": [
		{ type: "header", text: "Orders" },
		{
			type: "section",
			text: "Order search, lifecycle controls, and fulfillment actions will appear here.",
		},
	],
	"/inventory": [
		{ type: "header", text: "Inventory" },
		{
			type: "section",
			text: "Inventory levels, reservations, and restock controls will appear here.",
		},
	],
	"/extensions": [
		{ type: "header", text: "Extensions" },
		{
			type: "section",
			text: "Enabled commerce extensions and lifecycle controls will appear here.",
		},
	],
};

function renderPage(page: string) {
	return { blocks: PAGE_BLOCKS[page] ?? [{ type: "header", text: "Commerce" }] };
}

function renderInteractionFeedback(actionLabel: string) {
	return {
		blocks: [
			{ type: "header", text: "Commerce Admin" },
			{ type: "section", text: `${actionLabel} action is received and recorded by the commerce service.` },
		],
		toast: { message: "Interaction received", type: "info" },
	};
}

export async function commerceAdminRouteHandler(
	ctx: RouteContext<CommerceAdminInteraction>,
): Promise<{ blocks: Array<Record<string, unknown>>; toast?: { message: string; type: "success" | "error" | "info" } }> {
	const input = ctx.input;

	if (input.type === "page_load") {
		return renderPage(input.page);
	}

	if (input.type === "block_action") {
		return renderInteractionFeedback(`Block action (${input.action_id})`);
	}

	return renderInteractionFeedback("Form submit");
}

