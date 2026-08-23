import { Controller, Get, type INestApplication } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { AppSwagger } from "../../../../core/app.swagger";
import { ApiGetMicroservicesAuthJwksDocs } from "./api-get-microservices-auth-jwks-docs.decorator";

@Controller("auth/microservices")
class MicroservicesAuthJwksDocsTestController {
	@Get("jwks")
	@ApiGetMicroservicesAuthJwksDocs()
	getPublicJwks(): void {}
}

describe("ApiGetMicroservicesAuthJwksDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [MicroservicesAuthJwksDocsTestController],
		}).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document the plain unauthenticated JWKS response", () => {
		const operation = document.paths["/auth/microservices/jwks"]?.get;

		expect({ security: operation?.security, responses: operation?.responses }).toEqual({
			security: undefined,
			responses: {
				200: {
					description: "Microservice access-token verification keys returned.",
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/MicroservicesAuthJwksOutput" },
						},
					},
				},
			},
		});
	});
});
