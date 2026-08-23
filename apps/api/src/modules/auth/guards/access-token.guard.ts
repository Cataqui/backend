import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthSessionService } from "../auth-session.service";
import { AccessTokenRequiredError } from "../errors/access-token-required.error";
import type { IAuthenticatedRequest } from "../interfaces/authenticated-request.interface";

@Injectable()
export class AccessTokenGuard implements CanActivate {
	constructor(private readonly _authSessionService: AuthSessionService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<FastifyRequest>();
		const authorization = request.headers.authorization;

		if (typeof authorization !== "string") throw new AccessTokenRequiredError();

		const parts = authorization.trim().split(/\s+/);

		if (
			parts.length !== 2 ||
			parts[0]?.toLowerCase() !== "bearer" ||
			typeof parts[1] !== "string" ||
			!/^[A-Za-z0-9_-]{43}$/.test(parts[1])
		) {
			throw new AccessTokenRequiredError();
		}

		const session = await this._authSessionService.getActiveSessionFromAccessTokenOrNull({ accessToken: parts[1] });
		if (session === null) throw new AccessTokenRequiredError();

		(request as IAuthenticatedRequest).authSession = session;

		return true;
	}
}
