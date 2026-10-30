import { Hono } from "hono";
import { validator } from "hono-openapi";
import type { AuthContext } from "../http/context";
import { successResponse } from "../http/success-response";
import { validationHook } from "../http/validation.hook";
import { NotpService } from "../notp/notp.service";
import { CreateNotpIntentInputSchema } from "./create-notp-intent-input.schema";
import { ExchangeNotpIntentInputSchema } from "./exchange-notp-intent-input.schema";
import { createNotpIntentDocs, exchangeNotpIntentDocs } from "./notp.openapi";

export const notpRoutes = new Hono<AuthContext>()
	.post(
		"/intents",
		validator("json", CreateNotpIntentInputSchema, validationHook),
		createNotpIntentDocs,
		async (context) => {
			const body = context.req.valid("json");
			return context.json(
				successResponse(context, await context.var.resolve(NotpService).createIntent({ channel: body.channel })),
				201,
			);
		},
	)
	.post(
		"/intents/exchange",
		validator("json", ExchangeNotpIntentInputSchema, validationHook),
		exchangeNotpIntentDocs,
		async (context) => {
			const body = context.req.valid("json");
			const result = await context.var
				.resolve(NotpService)
				.exchangeIntentForSession({ intentToken: body.intentToken, abortSignal: context.req.raw.signal });

			if ("status" in result) {
				context.header("Retry-After", String(result.retryAfterSeconds));
				return context.json(successResponse(context, result), 202);
			}

			return context.json(successResponse(context, result), 201);
		},
	);
