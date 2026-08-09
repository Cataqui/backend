import { Body, Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../../core/app.swagger";
import { ExchangeInboundMessageAuthIntentInputSchema } from "../schemas/exchange-inbound-message-auth-intent-input.schema";
import { ApiExchangeInboundMessageAuthIntentDocs } from "./api-exchange-inbound-message-auth-intent-docs.decorator";

@Controller("auth")
class ExchangeInboundMessageAuthIntentDocsTestController {
	@Post("inbound-message/intents/exchange")
	@ApiExchangeInboundMessageAuthIntentDocs()
	exchange(
		@Body({ schema: ExchangeInboundMessageAuthIntentInputSchema })
		_body: z.infer<typeof ExchangeInboundMessageAuthIntentInputSchema>,
	): void {}
}

describe("ApiExchangeInboundMessageAuthIntentDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [ExchangeInboundMessageAuthIntentDocsTestController],
		}).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document token-only inbound-message session exchange and every possible response", () => {
		const operation = document.paths["/auth/inbound-message/intents/exchange"]?.post;

		expect({
			requestBody: operation?.requestBody,
			responses: operation?.responses,
		}).toEqual({
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: { $ref: "#/components/schemas/ExchangeInboundMessageAuthIntentInput" },
					},
				},
			},
			responses: {
				201: {
					description: "The verified intent was exchanged for a bearer session.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/AuthSessionOutputSuccessResponse" } },
					},
				},
				202: {
					description: "The inbound message has not verified the intent yet.",
					headers: {
						"Retry-After": {
							description: "Seconds the client should wait before polling this endpoint again.",
							schema: { type: "integer", example: 2 },
						},
					},
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/AuthIntentPendingOutputSuccessResponse" },
						},
					},
				},
				404: {
					description: "The intent token is unknown or expired.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
				503: {
					description: "The durable session could not be created safely.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
			},
		});
	});
});
