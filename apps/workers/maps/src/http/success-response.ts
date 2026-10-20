import type { SuccessResponse } from "@cataqui/response";
import type { Context } from "hono";
import type { MapsContext } from "./context";

export function successResponse<T>(params: { context: Context<MapsContext>; data: T }): SuccessResponse<T> {
	return {
		data: params.data,
		requestId: params.context.get("requestId"),
		timestamp: new Date().toISOString(),
		endpoint: params.context.req.path,
	};
}
