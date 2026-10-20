import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Reflector } from "@nestjs/core";
import { AccessTokenRequiredError } from "./errors/access-token-required.error";
import type { IAuthenticatedRequest } from "./interfaces/authenticated-request.interface";
import { Public } from "./decorators/public.decorator";

@Injectable()
export class AuthenticationGuard implements CanActivate {
	constructor(private readonly _reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const isPublic = this._reflector.getAllAndOverride(Public, [context.getHandler(), context.getClass()]);
		if (isPublic) return true;

		const request = context.switchToHttp().getRequest<FastifyRequest>();
		const serializedSession = request.headers["x-cataqui-auth-session"];
		if (typeof serializedSession !== "string") throw new AccessTokenRequiredError();

		const session: AuthenticatedSession = JSON.parse(serializedSession);
		(request as IAuthenticatedRequest).authSession = session;
		return true;
	}
}
