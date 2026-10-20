import type { SuccessResponse } from "@cataqui/response";
import type { Context } from "hono";
import type { AuthContext } from "./context";

export function successResponse<T>(context: Context<AuthContext>, data: T): SuccessResponse<T> {
	return {
		data: data,
		requestId: context.get("requestId"),
		timestamp: new Date().toISOString(),
		endpoint: new URL(context.req.url).pathname,
	};
}
