import { Body, Controller, Header, HttpCode, HttpStatus, Post, Res, Version } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import type { z } from "zod";
import { ApiCreateNotpIntentDocs } from "./decorators/api-create-notp-intent-docs.decorator";
import { ApiExchangeNotpIntentDocs } from "./decorators/api-exchange-notp-intent-docs.decorator";
import { NotpService } from "./notp.service";
import { NotpIntentExchangeOutputSchema } from "./schemas/notp-intent-exchange-output.schema";
import { CreateNotpIntentInputSchema } from "./schemas/create-notp-intent-input.schema";
import { ExchangeNotpIntentInputSchema } from "./schemas/exchange-notp-intent-input.schema";
import { NotpIntentOutputSchema } from "./schemas/notp-intent-output.schema";

@ApiTags("auth")
@Controller("auth/notp")
export class NotpController {
	constructor(private readonly _notpService: NotpService) {}

	@Post("intents")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.CREATED)
	@ApiCreateNotpIntentDocs()
	async createIntent(
		@Body({ schema: CreateNotpIntentInputSchema })
		body: z.infer<typeof CreateNotpIntentInputSchema>,
	): Promise<z.infer<typeof NotpIntentOutputSchema>> {
		return this._notpService.createIntent({
			channel: body.channel,
		});
	}

	@Post("intents/exchange")
	@Version("1")
	@Header("Cache-Control", "no-store")
	@HttpCode(HttpStatus.ACCEPTED)
	@ApiExchangeNotpIntentDocs()
	async exchangeIntentForSession(
		@Body({ schema: ExchangeNotpIntentInputSchema })
		body: z.infer<typeof ExchangeNotpIntentInputSchema>,
		@Res({ passthrough: true }) reply: FastifyReply,
	): Promise<z.infer<typeof NotpIntentExchangeOutputSchema>> {
		const exchangeAbortController = new AbortController();
		const abortExchangeWhenClientDisconnects = () => exchangeAbortController.abort();

		reply.raw.once("close", abortExchangeWhenClientDisconnects);

		let result: z.infer<typeof NotpIntentExchangeOutputSchema>;

		try {
			result = await this._notpService.exchangeIntentForSession({
				abortSignal: exchangeAbortController.signal,
				intentToken: body.intentToken,
			});
		} finally {
			reply.raw.off("close", abortExchangeWhenClientDisconnects);
		}

		if ("status" in result) {
			reply.header("Retry-After", String(result.retryAfterSeconds));
			return result;
		}

		reply.status(HttpStatus.CREATED);
		return result;
	}
}
