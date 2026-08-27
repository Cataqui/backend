import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { ProductAnalyticsEvent } from "../../core/observability/product-analytics-event.decorator";
import { ProductAnalyticsEventName } from "../../core/observability/product-analytics-event-name.enum";
import { AuthSessionService } from "./auth-session.service";
import { AccessTokenRequired } from "./decorators/access-token-required.decorator";
import {
	ApiGetCurrentAuthSessionDocs,
	ApiLogoutCurrentAuthSessionDocs,
	ApiRefreshAuthSessionDocs,
	ApiRevokeAllAuthSessionsDocs,
} from "./decorators/api-manage-auth-session-docs.decorator";
import { CurrentAuthSession } from "./decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "./interfaces/authenticated-session.interface";
import { AuthSessionOutputSchema } from "./schemas/auth-session-output.schema";
import { CurrentAuthSessionOutputSchema } from "./schemas/current-auth-session-output.schema";
import { RefreshTokenInputSchema } from "./schemas/refresh-token-input.schema";

@ApiTags("auth")
@Controller("auth/sessions")
export class AuthSessionController {
	constructor(private readonly _authSessionService: AuthSessionService) {}

	@Post("refresh")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.OK)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.AUTH_SESSION_REFRESH_REQUEST_SUCCEEDED })
	@ApiRefreshAuthSessionDocs()
	async refreshSession(
		@Body({ schema: RefreshTokenInputSchema }) body: z.infer<typeof RefreshTokenInputSchema>,
	): Promise<z.infer<typeof AuthSessionOutputSchema>> {
		return this._authSessionService.refresh({ currentRefreshToken: body.refreshToken });
	}

	@Get("current")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.AUTH_SESSION_READ_REQUEST_SUCCEEDED })
	@ApiGetCurrentAuthSessionDocs()
	getCurrentSession(
		@CurrentAuthSession() session: IAuthenticatedSession,
	): z.infer<typeof CurrentAuthSessionOutputSchema> {
		return {
			sessionId: session.sessionId,
			userId: session.userId,
			expiresAt: session.expiresAt.toISOString(),
		};
	}

	@Post("logout")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.AUTH_SESSION_LOGOUT_REQUEST_SUCCEEDED })
	@ApiLogoutCurrentAuthSessionDocs()
	async logoutCurrentSession(
		@Body({ schema: RefreshTokenInputSchema }) body: z.infer<typeof RefreshTokenInputSchema>,
	): Promise<void> {
		await this._authSessionService.logout({ refreshToken: body.refreshToken });
	}

	@Delete()
	@Version("1")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.NO_CONTENT)
	@ProductAnalyticsEvent({ eventName: ProductAnalyticsEventName.AUTH_SESSIONS_REVOKE_REQUEST_SUCCEEDED })
	@ApiRevokeAllAuthSessionsDocs()
	async revokeAllSessions(@CurrentAuthSession() session: IAuthenticatedSession): Promise<void> {
		await this._authSessionService.revokeAll({ session: session });
	}
}
