import { Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { AppSwagger } from "../../../../core/app.swagger";
import { ApiCreateMapsAccessTokenDocs } from "./api-create-maps-access-token-docs.decorator";

@Controller("auth/microservices")
class MapsAccessTokenDocsTestController {
	@Post("maps")
	@ApiCreateMapsAccessTokenDocs()
	create(): void {}
}

describe("ApiCreateMapsAccessTokenDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [MapsAccessTokenDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document authenticated token issuance without a rate-limit response", () => {
		const operation = document.paths["/auth/microservices/maps"]?.post;

		expect({
			requestBody: operation?.requestBody,
			security: operation?.security,
			responses: operation?.responses,
		}).toEqual({
			requestBody: undefined,
			security: [{ bearer: [] }],
			responses: {
				200: {
					description: "Maps access token created.",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/MicroserviceAccessTokenOutputSuccessResponse" },
						},
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
