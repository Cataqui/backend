import { Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { AppSwagger } from "../../../../core/app.swagger";
import { ApiCreateGeosearchAccessTokenDocs } from "./api-create-geosearch-access-token-docs.decorator";

@Controller("auth/microservices")
class GeosearchAccessTokenDocsTestController {
	@Post("geosearch")
	@ApiCreateGeosearchAccessTokenDocs()
	create(): void {}
}

describe("ApiCreateGeosearchAccessTokenDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [GeosearchAccessTokenDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document authenticated token issuance and rate-limit recovery", () => {
		const operation = document.paths["/auth/microservices/geosearch"]?.post;

		expect({
			requestBody: operation?.requestBody,
			security: operation?.security,
			responses: operation?.responses,
		}).toEqual({
			requestBody: undefined,
			security: [{ bearer: [] }],
			responses: {
				200: {
					description: "Geosearch access token created.",
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
				429: {
					description: "The authenticated user's geosearch token budget has been exhausted.",
					headers: {
						"Retry-After": {
							description: "Seconds until another geosearch access token may be requested.",
							schema: { type: "integer", example: 3_600 },
						},
					},
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
			},
		});
	});
});
