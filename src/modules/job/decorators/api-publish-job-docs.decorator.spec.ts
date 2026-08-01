import { Controller, type INestApplication, Param, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { GetJobRequestParamsDto } from "../dto/get-job-request-params.dto";
import { ApiPublishJobDocs } from "./api-publish-job-docs.decorator";

@Controller("job")
class PublishJobDocsTestController {
	@Post(":job_id/publish")
	@ApiPublishJobDocs()
	publish(@Param() _params: GetJobRequestParamsDto): void {}
}

describe("ApiPublishJobDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [PublishJobDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
	});

	afterAll(async () => {
		await app.close();
	});

	it("should explain how consumers publish a completed draft and every documented outcome", () => {
		const operation = document.paths["/job/{job_id}/publish"]?.post;

		expect({
			summary: operation?.summary,
			description: operation?.description,
			jobIdParameter: operation?.parameters?.[0],
			responses: operation?.responses,
		}).toEqual({
			summary: "Publish a job",
			description:
				"Publishes a completed draft and makes it available in the job feed. Before publishing, use `PATCH /v1/job/{job_id}` to add any fields that are missing or you want to change. \n\nIf the draft is incomplete, it remains a draft. Once the job has been published, this endpoint cannot publish it again.",
			jobIdParameter: {
				name: "job_id",
				required: true,
				in: "path",
				description: "ID of the draft to publish.",
				schema: {
					type: "string",
					format: "uuid",
					example: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				},
			},
			responses: {
				200: {
					description: "The job was published and returned.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/JobOutputDto" } },
					},
				},
				400: {
					description:
						"The draft is missing one or more required fields. The error message lists the fields to add before trying again.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutputDto" } },
					},
				},
				404: {
					description: "No job exists with the supplied job_id.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutputDto" } },
					},
				},
				409: {
					description: "The job has already been published.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutputDto" } },
					},
				},
				503: {
					description:
						"We could not derive important data from the description. The job remains a draft; try publishing it again.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutputDto" } },
					},
				},
			},
		});
	});
});
