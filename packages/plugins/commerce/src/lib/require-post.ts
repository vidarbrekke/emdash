import type { RouteContext } from "emdash";
import { throwMethodNotAllowed } from "../route-errors.js";

/** Aligns with documented route pattern: mutate endpoints should reject GET/HEAD. */
export function requirePost(ctx: RouteContext): void {
	if (ctx.request.method !== "POST") {
		throwMethodNotAllowed("Only POST is allowed");
	}
}
