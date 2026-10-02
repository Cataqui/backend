import { Controller, Get, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { MicroservicesAuthJwksOutputSchema } from "@cataqui/microservices-auth-schemas/jwks";
import type { z } from "zod";
import { SkipEnvelope } from "../../../shared/decorators/skip-envelope.decorator";
import { AccessTokenRequired } from "../decorators/access-token-required.decorator";
import { CurrentAuthSession } from "../decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "../interfaces/authenticated-session.interface";
import { ApiCreateMapsAccessTokenDocs } from "./decorators/api-create-maps-access-token-docs.decorator";
import { ApiGetMicroservicesAuthJwksDocs } from "./decorators/api-get-microservices-auth-jwks-docs.decorator";
import { MicroservicesAuthService } from "./microservices-auth.service";
import { MicroserviceAccessTokenOutputSchema } from "./schemas/microservice-access-token-output.schema";

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

	@Post("maps")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@AccessTokenRequired()
	@HttpCode(HttpStatus.OK)
	@ApiCreateMapsAccessTokenDocs()
	async createMapsAccessToken(
		@CurrentAuthSession() authSession: IAuthenticatedSession,
	): Promise<z.infer<typeof MicroserviceAccessTokenOutputSchema>> {
		return this._microservicesAuthService.createMapsAccessToken({ userId: authSession.userId });
	}
}
