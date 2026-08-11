import { Body, Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../core/app.swagger";
import { CreateJobDraftInputSchema } from "../schemas/create-job-draft-input.schema";
import { ApiCreateJobDraftDocs } from "./api-create-job-draft-docs.decorator";

@Controller("jobs")
class CreateJobDraftDocsTestController {
	@Post("drafts")
	@ApiCreateJobDraftDocs()
	create(@Body({ schema: CreateJobDraftInputSchema }) _body: z.infer<typeof CreateJobDraftInputSchema>): void {}
}

describe("ApiCreateJobDraftDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [CreateJobDraftDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should document authenticated draft creation and every rate-limit outcome", () => {
		const operation = document.paths["/jobs/drafts"]?.post;

		expect({
			description: operation?.description,
			security: operation?.security,
			responses: operation?.responses,
		}).toEqual({
			description:
				"Creates a draft from a job description and schedules AI-derived feed metadata. Use the returned jobId to update and publish the job later. Each authenticated user may create up to 20 drafts per hour.",
			security: [{ bearer: [] }],
			responses: {
				201: {
					description: "Job draft created.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/DraftJobOutputSuccessResponse" } },
					},
				},
				400: {
					description: "Invalid job description.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
				401: {
					description: "A valid bearer access token is required.",
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
				429: {
					description: "The authenticated user has created 20 job drafts during the current one-hour window.",
					headers: {
						"Retry-After": {
							description: "Seconds until another draft-creation request may be attempted.",
							schema: { type: "integer", example: 900 },
						},
					},
					content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } } },
				},
			},
		});
	});
});
