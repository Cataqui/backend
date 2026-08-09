import { Body, Controller, Header, HttpCode, HttpStatus, Post, Res, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import type { z } from "zod";
import { ApiCreateInboundMessageAuthIntentDocs } from "./decorators/api-create-inbound-message-auth-intent-docs.decorator";
import { ApiExchangeInboundMessageAuthIntentDocs } from "./decorators/api-exchange-inbound-message-auth-intent-docs.decorator";
import { InboundMessageAuthService } from "./inbound-message-auth.service";
import { AuthIntentExchangeOutputSchema } from "./schemas/auth-intent-exchange-output.schema";
import { CreateInboundMessageAuthIntentInputSchema } from "./schemas/create-inbound-message-auth-intent-input.schema";
import { ExchangeInboundMessageAuthIntentInputSchema } from "./schemas/exchange-inbound-message-auth-intent-input.schema";
import { InboundMessageAuthIntentOutputSchema } from "./schemas/inbound-message-auth-intent-output.schema";

@ApiTags("auth")
@Controller("auth/inbound-message")
export class InboundMessageAuthController {
	constructor(private readonly _inboundMessageAuthService: InboundMessageAuthService) {}

	@Post("intents")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.CREATED)
	@ApiCreateInboundMessageAuthIntentDocs()
	async createIntent(
		@Body({ schema: CreateInboundMessageAuthIntentInputSchema })
		body: z.infer<typeof CreateInboundMessageAuthIntentInputSchema>,
	): Promise<z.infer<typeof InboundMessageAuthIntentOutputSchema>> {
		return this._inboundMessageAuthService.createIntent({
			channel: body.channel,
		});
	}

	@Post("intents/exchange")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.ACCEPTED)
	@ApiExchangeInboundMessageAuthIntentDocs()
	async exchangeIntentForSession(
		@Body({ schema: ExchangeInboundMessageAuthIntentInputSchema })
		body: z.infer<typeof ExchangeInboundMessageAuthIntentInputSchema>,
		@Res({ passthrough: true }) reply: FastifyReply,
	): Promise<z.infer<typeof AuthIntentExchangeOutputSchema>> {
		const result = await this._inboundMessageAuthService.exchangeIntentForSession({
			intentToken: body.intentToken,
		});

		if ("status" in result) {
			reply.header("Retry-After", String(result.retryAfterSeconds));
			return result;
		}

		reply.status(HttpStatus.CREATED);
		return result;
	}
}
