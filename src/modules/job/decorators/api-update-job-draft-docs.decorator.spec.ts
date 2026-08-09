import { Body, Controller, type INestApplication, Param, Patch } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../core/app.swagger";
import { GetJobInputSchema } from "../schemas/get-job-input.schema";
import { UpdateJobInputSchema } from "../schemas/update-job-input.schema";
import { ApiUpdateJobDraftDocs } from "./api-update-job-draft-docs.decorator";

@Controller("jobs")
class UpdateJobDraftDocsTestController {
	@Patch("drafts/:jobId")
	@ApiUpdateJobDraftDocs()
	updateDraft(
		@Param({ schema: GetJobInputSchema }) _params: z.infer<typeof GetJobInputSchema>,
		@Body({ schema: UpdateJobInputSchema }) _dto: z.infer<typeof UpdateJobInputSchema>,
	): void {}
}

describe("ApiUpdateJobDraftDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [UpdateJobDraftDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document the explicit draft update route and draft output contract", () => {
		const operation = document.paths["/jobs/drafts/{jobId}"]?.patch;

		expect({
			summary: operation?.summary,
			successResponse: operation?.responses?.[200],
		}).toEqual({
			summary: "Update a job draft",
			successResponse: {
				description: "The draft was updated; derived metadata may still be refreshing.",
				content: {
					"application/json": { schema: { $ref: "#/components/schemas/DraftJobOutputSuccessResponse" } },
				},
			},
		});
	});
});
