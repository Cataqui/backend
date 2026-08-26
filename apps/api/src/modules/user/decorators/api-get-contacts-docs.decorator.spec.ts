import { Controller, Get, type INestApplication } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { AppSwagger } from "../../../core/app.swagger";
import { ApiGetContactsDocs } from "./api-get-contacts-docs.decorator";

@Controller("users/me/contacts")
class GetContactsDocsTestController {
	@Get()
	@ApiGetContactsDocs()
	getContacts(): void {}
}

describe("ApiGetContactsDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [GetContactsDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document the authenticated saved contact collection", () => {
		const operation = document.paths["/users/me/contacts"]?.get;

		expect({ security: operation?.security, responses: operation?.responses }).toEqual({
			security: [{ bearer: [] }],
			responses: {
				200: {
					description: "Saved contacts returned for the authenticated user.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/SavedContactsOutputSuccessResponse" } },
					},
				},
				401: {
					description: "A valid bearer access token is required.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
			},
		});
	});
});
