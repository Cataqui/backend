import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { IAuthenticatedRequest } from "../interfaces/authenticated-request.interface";

export const CurrentAuthSession = createParamDecorator(
	(_data: unknown, context: ExecutionContext): AuthenticatedSession =>
		context.switchToHttp().getRequest<IAuthenticatedRequest>().authSession,
);
