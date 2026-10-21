import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import type { FastifyRequest } from "fastify";

export interface IAuthenticatedRequest extends FastifyRequest {
	authSession: AuthenticatedSession;
}
