import { Controller, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { RateLimit } from "../../../core/throttle/rate-limit.decorator";
import { CurrentAuthSession } from "../decorators/current-auth-session.decorator";
import type { IAuthenticatedSession } from "../interfaces/authenticated-session.interface";
import { ApiCreateGeosearchAccessTokenDocs } from "./decorators/api-create-geosearch-access-token-docs.decorator";
import { MicroservicesAuthService } from "./microservices-auth.service";
import { MicroserviceAccessTokenOutputSchema } from "./schemas/microservice-access-token-output.schema";

@ApiTags("auth")
@Controller("auth/microservices")
export class MicroservicesAuthController {
	constructor(private readonly _microservicesAuthService: MicroservicesAuthService) {}

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
