import { Body, Controller, type INestApplication, Param, Patch } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { GetJobRequestParamsDto } from "../dto/get-job-request-params.dto";
import { UpdateJobRequestDto } from "../dto/update-job-request.dto";
import { ApiUpdateJobDocs } from "./api-update-job-docs.decorator";

@Controller("job")
class UpdateJobDocsTestController {
	@Patch(":job_id")
	@ApiUpdateJobDocs()
	update(@Param() _params: GetJobRequestParamsDto, @Body() _dto: UpdateJobRequestDto): void {}
}

describe("ApiUpdateJobDocs", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [UpdateJobDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
	});

	afterAll(async () => {
		await app.close();
	});

	it("should explain how consumers partially update a job and every documented outcome", () => {
		const operation = document.paths["/job/{job_id}"]?.patch;

		expect({
			summary: operation?.summary,
			description: operation?.description,
			jobIdParameter: operation?.parameters?.[0],
			requestBody: operation?.requestBody,
			responses: operation?.responses,
		}).toEqual({
			summary: "Update a job",
			description:
				"Updates the fields supplied in the request and leaves all other fields unchanged. This works for both drafts and published jobs",
			jobIdParameter: {
				name: "job_id",
				required: true,
				in: "path",
				description: "ID of the draft or published job to update.",
				schema: {
					type: "string",
					format: "uuid",
					example: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
				},
			},
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: { $ref: "#/components/schemas/UpdateJobRequestDto" },
					},
				},
			},
			responses: {
				200: {
					description:
						"The job was updated. When the description changes, the title other derived info may still be refreshing.",
					content: {
						"application/json": { schema: { $ref: "#/components/schemas/JobOutputDto" } },
					},
				},
				400: {
					description:
						"The request is invalid in some way, e.g. an invalid field, incomplete nested object, etc. No changes were saved.",
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
			},
		});
	});
});
