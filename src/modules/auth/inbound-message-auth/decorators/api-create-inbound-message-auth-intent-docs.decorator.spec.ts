import { Body, Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../../core/app.swagger";
import { CreateInboundMessageAuthIntentInputSchema } from "../schemas/create-inbound-message-auth-intent-input.schema";
import { ApiCreateInboundMessageAuthIntentDocs } from "./api-create-inbound-message-auth-intent-docs.decorator";

@Controller("auth")
class CreateInboundMessageAuthIntentDocsTestController {
	@Post("inbound-message/intents")
	@ApiCreateInboundMessageAuthIntentDocs()
	create(
		@Body({ schema: CreateInboundMessageAuthIntentInputSchema })
		_body: z.infer<typeof CreateInboundMessageAuthIntentInputSchema>,
	): void {}
}

describe("ApiCreateInboundMessageAuthIntentDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [CreateInboundMessageAuthIntentDocsTestController],
		}).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document inbound-message authentication intent creation and every possible response", () => {
		const operation = document.paths["/auth/inbound-message/intents"]?.post;

		expect({
			summary: operation?.summary,
			description: operation?.description,
			responses: operation?.responses,
		}).toEqual({
			summary: "Create an inbound-message authentication intent",
			description:
				"Creates a short-lived authentication code, its channel-specific receiver, and a secret intent token for the requested messaging channel. The Cataquí mobile client asks the user to send the code to that receiver through the channel and keeps the intent token private for polling. An unused intent expires after 15 minutes; after message verification, the token remains exchangeable for five minutes.",
			responses: {
				201: {
					description: "Inbound-message authentication intent created.",
					headers: {
						"Cache-Control": {
							description: "Prevents caches from storing the authentication code.",
							schema: { type: "string", example: "no-store" },
						},
					},
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/InboundMessageAuthIntentOutputSuccessResponse" },
						},
					},
				},
				503: {
					description:
						"Every generated authentication credential set conflicted with an active intent. The caller should try again.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
			},
		});
	});

	it("should document the channel-specific code receiver", () => {
		const outputSchema = document.components?.schemas?.["InboundMessageAuthIntentOutput"] as
			| {
					properties?: Record<string, unknown>;
					required?: string[];
			  }
			| undefined;

		expect({
			codeReceiver: outputSchema?.properties?.["codeReceiver"],
			isRequired: outputSchema?.required?.includes("codeReceiver"),
		}).toEqual({
			codeReceiver: {
				type: "string",
				minLength: 1,
				description: "Channel-specific destination that receives the authentication code.",
			},
			isRequired: true,
		});
	});

	it("should document the requested inbound-message channel", () => {
		const operation = document.paths["/auth/inbound-message/intents"]?.post;

		expect(operation?.requestBody).toEqual({
			required: true,
			content: {
				"application/json": {
					schema: { $ref: "#/components/schemas/CreateInboundMessageAuthIntentInput" },
				},
			},
		});
	});
});
