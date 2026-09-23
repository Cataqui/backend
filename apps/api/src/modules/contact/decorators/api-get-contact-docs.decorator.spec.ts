import { Controller, Get, type INestApplication, Param } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../core/app.swagger";
import { GetContactInputSchema } from "../schemas/get-contact-input.schema";
import { ApiGetContactDocs } from "./api-get-contact-docs.decorator";

@Controller("contacts")
class GetContactDocsTestController {
	@Get(":contactId")
	@ApiGetContactDocs()
	getContact(@Param({ schema: GetContactInputSchema }) _params: z.infer<typeof GetContactInputSchema>): void {}
}

describe("ApiGetContactDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [GetContactDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("documents public lookup and missing or invalid contact IDs", () => {
		const operation = document.paths["/contacts/{contactId}"]?.get;
		expect(operation?.security).toBeUndefined();
		expect(Object.keys(operation?.responses ?? {})).toEqual(["200", "400", "404"]);
		expect(operation?.responses["200"]).toMatchObject({
			content: { "application/json": { schema: { $ref: "#/components/schemas/ContactOutputSuccessResponse" } } },
		});
	});
});
