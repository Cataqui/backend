import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { IAuthenticatedRequest } from "../interfaces/authenticated-request.interface";
import type { IAuthenticatedSession } from "../interfaces/authenticated-session.interface";

export const CurrentAuthSession = createParamDecorator(
	(_data: unknown, context: ExecutionContext): IAuthenticatedSession =>
		context.switchToHttp().getRequest<IAuthenticatedRequest>().authSession,
);
