import { Controller, Get, type INestApplication, Param, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { ApiBearerAuth, type OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../core/app.swagger";
import { GetJobContactInputSchema } from "../schemas/get-job-contact-input.schema";
import { GetJobInputSchema } from "../schemas/get-job-input.schema";
import { ApiArchiveJobDocs } from "./api-archive-job-docs.decorator";
import { ApiGetJobContactDocs } from "./api-get-job-contact-docs.decorator";

@Controller("jobs")
class JobLifecycleDocsTestController {
	@Post(":jobId/archive")
	@ApiBearerAuth()
	@ApiArchiveJobDocs()
	archiveJob(@Param({ schema: GetJobInputSchema }) _params: z.infer<typeof GetJobInputSchema>): void {}

	@Get(":jobId/contact/:contactId")
	@ApiGetJobContactDocs()
	getJobContact(@Param({ schema: GetJobContactInputSchema }) _params: z.infer<typeof GetJobContactInputSchema>): void {}
}

describe("job lifecycle Swagger docs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [JobLifecycleDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("documents authenticated archive with the updated job response", () => {
		const operation = document.paths["/jobs/{jobId}/archive"]?.post;
		expect(operation?.security).toEqual([{ bearer: [] }]);
		expect(Object.keys(operation?.responses ?? {})).toEqual(["200", "400", "401", "404"]);
		expect(operation?.responses["200"]).toMatchObject({
			content: { "application/json": { schema: { $ref: "#/components/schemas/PublicJobOutputSuccessResponse" } } },
		});
	});

	it("documents public job-scoped contact lookup", () => {
		const operation = document.paths["/jobs/{jobId}/contact/{contactId}"]?.get;
		expect(operation?.security).toBeUndefined();
		expect(Object.keys(operation?.responses ?? {})).toEqual(["200", "400", "404"]);
	});
});
