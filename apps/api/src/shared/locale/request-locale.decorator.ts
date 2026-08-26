import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { RequestUtils } from "../utils/request.utils";

export const RequestLocale = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
	const request = ctx.switchToHttp().getRequest<FastifyRequest>();
	return RequestUtils.resolveRequestLocale(request.headers["accept-language"]);
});
