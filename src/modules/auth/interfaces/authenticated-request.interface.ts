import type { FastifyRequest } from "fastify";
import type { IAuthenticatedSession } from "./authenticated-session.interface";

export interface IAuthenticatedRequest extends FastifyRequest {
	authSession: IAuthenticatedSession;
}
