import { Controller, Get, type INestApplication } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { AppSwagger } from "../../../core/app.swagger";
import { ApiGetCurrentUserDocs } from "./api-get-current-user-docs.decorator";

@Controller("users/me")
class GetCurrentUserDocsTestController {
	@Get()
	@ApiGetCurrentUserDocs()
	getCurrentUser(): void {}
}

describe("ApiGetCurrentUserDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [GetCurrentUserDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document current user information as an authenticated resource", () => {
		const operation = document.paths["/users/me"]?.get;

		expect({
			summary: operation?.summary,
			description: operation?.description,
			security: operation?.security,
			responses: operation?.responses,
		}).toEqual({
			summary: "Get current user",
			description: "Returns information about the authenticated user.",
			security: [{ bearer: [] }],
			responses: {
				200: {
					description: "Current user returned.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/CurrentUserOutputSuccessResponse" } },
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
