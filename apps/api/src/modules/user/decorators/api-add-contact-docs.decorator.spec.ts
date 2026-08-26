import { Body, Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../core/app.swagger";
import { ContactInputSchema } from "../schemas/contact-input.schema";
import { ApiAddContactDocs } from "./api-add-contact-docs.decorator";

@Controller("users/me/contacts")
class AddContactDocsTestController {
	@Post()
	@ApiAddContactDocs()
	addContact(@Body({ schema: ContactInputSchema }) _body: z.infer<typeof ContactInputSchema>): void {}
}

describe("ApiAddContactDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [AddContactDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document the authenticated immutable contact contract", () => {
		const operation = document.paths["/users/me/contacts"]?.post;

		expect({ security: operation?.security, responses: operation?.responses }).toEqual({
			security: [{ bearer: [] }],
			responses: {
				201: {
					description: "Contact saved for the authenticated user.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/SavedContactOutputSuccessResponse" } },
					},
				},
				400: {
					description: "The contact method or identifier is invalid.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
				401: {
					description: "A valid bearer access token is required.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
			},
		});
	});
});
