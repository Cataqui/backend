import { Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { ApiCreateWhatsappAuthIntentDocs } from "./api-create-whatsapp-auth-intent-docs.decorator";

@Controller("auth")
class CreateWhatsAppAuthIntentDocsTestController {
	@Post("whatsapp/intents")
	@ApiCreateWhatsappAuthIntentDocs()
	create(): void {}
}

describe("ApiCreateWhatsAppAuthIntentDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [CreateWhatsAppAuthIntentDocsTestController],
		}).compile();
		app = module.createNestApplication(new FastifyAdapter());
		document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document WhatsApp authentication intent creation and every possible response", () => {
		const operation = document.paths["/auth/whatsapp/intents"]?.post;

		expect({
			summary: operation?.summary,
			description: operation?.description,
			responses: operation?.responses,
		}).toEqual({
			summary: "Create a WhatsApp authentication intent",
			description:
				"Creates a short-lived authentication code for a Cataquí frontend to place in a user-initiated WhatsApp message. The endpoint is open, does not send a WhatsApp message, and the returned code expires after 15 minutes.",
			responses: {
				201: {
					description: "WhatsApp authentication intent created.",
					headers: {
						"Cache-Control": {
							description: "Prevents caches from storing the authentication code.",
							schema: { type: "string", example: "no-store" },
						},
					},
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/WhatsappAuthIntentOutputDto" } },
					},
				},
				429: {
					description: "The caller exceeded five authentication intent requests within one minute.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutputDto" } } },
				},
				503: {
					description: "The authentication intent could not be stored safely. The caller should try again.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutputDto" } } },
				},
			},
		});
	});
});
