import { Controller, Get, type INestApplication } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { AppSwagger } from "../../../core/app.swagger";
import { ApiGetCurrentUserJobsDocs } from "./api-get-current-user-jobs-docs.decorator";

@Controller("users/me/jobs")
class UserJobsDocsTestController {
	@Get()
	@ApiGetCurrentUserJobsDocs()
	getUserJobs(): void {}
}

describe("ApiGetCurrentUserJobsDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [UserJobsDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("documents the protected paginated posted jobs collection", () => {
		const operation = document.paths["/users/me/jobs"]?.get;
		expect(operation?.security).toEqual([{ bearer: [] }]);
		expect(operation?.responses?.["200"]).toMatchObject({
			content: {
				"application/json": { schema: { $ref: "#/components/schemas/UserJobSummaryOutputPaginatedSuccessResponse" } },
			},
		});
		expect(operation?.responses?.["400"]).toBeDefined();
		expect(operation?.responses?.["401"]).toBeDefined();
	});
});
