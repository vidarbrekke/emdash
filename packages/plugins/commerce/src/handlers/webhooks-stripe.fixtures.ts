export const stripeWebhookEventFixture = {
	id: "evt_live_test",
	type: "payment_intent.succeeded",
	data: {
		object: {
			id: "pi_live_test",
			metadata: {
				orderId: "order_1",
				finalizeToken: "token_12345678901234",
			},
		},
	},
} as const;

export const stripeWebhookEventMetadataAliasFixture = {
	id: "evt_legacy_aliases",
	type: "payment_intent.succeeded",
	data: {
		object: {
			id: "pi_1",
			metadata: {
				emdashOrderId: "order_1",
				emdashFinalizeToken: "token_12345678901234",
			},
		},
	},
} as const;
