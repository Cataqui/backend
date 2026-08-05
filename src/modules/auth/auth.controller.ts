import { Controller, Header, HttpCode, HttpStatus, Post, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { ApiCreateWhatsappAuthIntentDocs } from "./decorators/api-create-whatsapp-auth-intent-docs.decorator";
import { WhatsappAuthIntentOutputDto } from "./dto/whatsapp-auth-intent-output.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
	constructor(private readonly _authService: AuthService) {}

	@Post("whatsapp/intents")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@Throttle({ default: { limit: 5, ttl: 60_000 } })
	@HttpCode(HttpStatus.CREATED)
	@ApiCreateWhatsappAuthIntentDocs()
	async createWhatsAppIntent(): Promise<WhatsappAuthIntentOutputDto> {
		return this._authService.createWhatsAppIntent();
	}
}
