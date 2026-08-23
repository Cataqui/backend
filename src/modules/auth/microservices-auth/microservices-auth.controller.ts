import { Controller, Get, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { RateLimit } from "../../../core/throttle/rate-limit.decorator";
import { SkipEnvelope } from "../../../shared/decorators/skip-envelope.decorator";
import { CurrentAuthSession } from "../decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "../interfaces/authenticated-session.interface";
import { ApiCreateGeosearchAccessTokenDocs } from "./decorators/api-create-geosearch-access-token-docs.decorator";
import { ApiGetMicroservicesAuthJwksDocs } from "./decorators/api-get-microservices-auth-jwks-docs.decorator";
import { MicroservicesAuthService } from "./microservices-auth.service";
import { MicroserviceAccessTokenOutputSchema } from "./schemas/microservice-access-token-output.schema";
import { MicroservicesAuthJwksOutputSchema } from "./schemas/microservices-auth-jwks-output.schema";

@ApiTags("auth")
@Controller("auth/microservices")
export class MicroservicesAuthController {
	constructor(private readonly _microservicesAuthService: MicroservicesAuthService) {}

	@Get("jwks")
	@Version("1")
	@SkipEnvelope()
	@Header("Cache-Control", "public, max-age=300")
	@Header("Content-Type", "application/jwk-set+json")
	@ApiGetMicroservicesAuthJwksDocs()
	getPublicJwks(): z.infer<typeof MicroservicesAuthJwksOutputSchema> {
		return this._microservicesAuthService.getPublicJwks();
	}

	@Post("geosearch")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@RateLimit({ requests: 20, per: "day" })
	@HttpCode(HttpStatus.OK)
	@ApiCreateGeosearchAccessTokenDocs()
	async createGeosearchAccessToken(
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof MicroserviceAccessTokenOutputSchema>> {
		return this._microservicesAuthService.createGeosearchAccessToken({ userId: authSession.userId });
	}
}
