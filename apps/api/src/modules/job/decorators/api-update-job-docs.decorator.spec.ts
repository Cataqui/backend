import { Body, Controller, type INestApplication, Param, Patch } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { z } from "zod";
import { AppSwagger } from "../../../core/app.swagger";
import { GetJobInputSchema } from "../schemas/get-job-input.schema";
import { UpdateJobInputSchema } from "../schemas/update-job-input.schema";
import { ApiUpdateJobDocs } from "./api-update-job-docs.decorator";

@Controller("jobs")
class UpdateJobDocsTestController {
	@Patch(":jobId")
	@ApiUpdateJobDocs()
	update(
		@Param({ schema: GetJobInputSchema }) _params: z.infer<typeof GetJobInputSchema>,
		@Body({ schema: UpdateJobInputSchema }) _dto: z.infer<typeof UpdateJobInputSchema>,
	): void {}
}

describe("ApiUpdateJobDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [UpdateJobDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		const swaggerDocument = AppSwagger.setup(app);
		if (swaggerDocument === undefined) throw new Error("Swagger must be enabled while testing its documentation");
		document = swaggerDocument;
	});

	afterAll(async () => {
		await app.close();
	});

	it("should explain how consumers partially update a job and every documented outcome", () => {
		const operation = document.paths["/jobs/{jobId}"]?.patch;
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
			requestBody: operation?.requestBody,
			responses: operation?.responses,
		}).toEqual({
			summary: "Update a public job",
			description:
				"Updates an active or closed public job and leaves omitted fields unchanged. A description change refreshes its derived metadata before saving, so the public response always matches the current description. Each authenticated user may submit up to 60 public-job updates per hour.",
			jobIdParameter: {
				name: "jobId",
				required: true,
				in: "path",
				description: "ID of the public job to update.",
			},
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: { $ref: "#/components/schemas/UpdateJobInput" },
					},
				},
			},
			responses: {
				200: {
					description: "The public job was updated and returned with complete public fields.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/PublicJobOutputSuccessResponse" } },
					},
				},
				400: {
					description:
						"The request is invalid in some way, e.g. an invalid field, incomplete nested object, etc. No changes were saved.",
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
					description: "No public job owned by the authenticated user exists with the supplied jobId.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
				429: {
					description: "The authenticated user has submitted 60 job updates during the current one-hour window.",
					headers: {
						"Retry-After": {
							description: "Seconds until another job-update request may be attempted.",
							schema: { type: "integer", example: 300 },
						},
					},
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/ErrorOutput" } },
					},
				},
			},
		});
	});

	it("should document bearer authentication for job updates", () => {
		const operation = document.paths["/jobs/{jobId}"]?.patch;

		expect(operation?.security).toEqual([{ bearer: [] }]);
	});
});
