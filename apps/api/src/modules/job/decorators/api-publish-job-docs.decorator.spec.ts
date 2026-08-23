import { Controller, type INestApplication, Param, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../core/app.swagger";
import { GetJobInputSchema } from "../schemas/get-job-input.schema";
import { ApiPublishJobDocs } from "./api-publish-job-docs.decorator";

@Controller("jobs")
class PublishJobDocsTestController {
	@Post(":jobId/publish")
	@ApiPublishJobDocs()
	publish(@Param({ schema: GetJobInputSchema }) _params: z.infer<typeof GetJobInputSchema>): void {}
}

describe("ApiPublishJobDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [PublishJobDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should explain how consumers publish a completed draft and every documented outcome", () => {
		const operation = document.paths["/jobs/{jobId}/publish"]?.post;
		const jobIdParameter = operation?.parameters?.[0];

		expect({
			summary: operation?.summary,
			description: operation?.description,
			jobIdParameter:
				jobIdParameter && "in" in jobIdParameter
					? {
							name: jobIdParameter.name,
							required: jobIdParameter.required,
							in: jobIdParameter.in,
							description: jobIdParameter.description,
						}
					: jobIdParameter,
			responses: operation?.responses,
		}).toEqual({
			summary: "Publish a job",
			description:
				"Publishes a completed draft and makes it available in the job feed. Before publishing, use `PATCH /v1/jobs/drafts/{jobId}` to add any fields that are missing or you want to change. \n\nIf the draft is incomplete, it remains a draft. Repeating the request for an active job returns that job without publishing it again. A closed job cannot be published again. Each authenticated user may submit up to 20 publication requests per hour.",
			jobIdParameter: {
				name: "jobId",
				required: true,
				in: "path",
				description: "ID of the draft to publish.",
			},
			responses: {
				200: {
					description: "The job was published and returned, or the already active job was returned unchanged.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/PublicJobOutputSuccessResponse" } },
					},
				},
				400: {
					description:
						"The draft is missing one or more required fields. The error message lists the fields to add before trying again.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
				401: {
					description: "A valid bearer access token is required.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
				404: {
					description: "No job owned by the authenticated user exists with the supplied jobId.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
				409: {
					description: "The job is closed and cannot be published again.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
				429: {
					description:
						"The authenticated user has submitted 20 publication requests during the current one-hour window.",
					headers: {
						"Retry-After": {
							description: "Seconds until another publication request may be attempted.",
							schema: { type: "integer", example: 900 },
						},
					},
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
				503: {
					description:
						"Important data could not be derived from the description. The job remains a draft; try publishing it again.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
			},
		});
	});

	it("should document bearer authentication for job publication", () => {
		const operation = document.paths["/jobs/{jobId}/publish"]?.post;

		expect(operation?.security).toEqual([{ bearer: [] }]);
	});
});
