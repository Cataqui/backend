import { Body, Controller, type INestApplication, Post } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { ApiResponse, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";
import { AppSwagger } from "./app.swagger";

const ZodInputSchema = z.object({ name: z.string() }).meta({ id: "SwaggerFactoryInput" });
const ZodOutputSchema = z.coerce.number().meta({ id: "SwaggerFactoryOutput" });
const AlternativeStandardSchema = {
	"~standard": {
		version: 1,
		vendor: "alternative-library",
		validate: (value: unknown) => ({ value: value }),
		jsonSchema: {
			input: () => ({ type: "string" }),
		},
	},
} as unknown as StandardSchemaV1;

@Controller("swagger-factory")
class SwaggerFactoryTestController {
	@Post("zod")
	@ApiResponse({ status: 200, standardSchema: ZodOutputSchema })
	zod(@Body({ schema: ZodInputSchema }) _body: z.infer<typeof ZodInputSchema>): void {}

	@Post("alternative")
	alternative(@Body({ schema: AlternativeStandardSchema }) _body: unknown): void {}
}

describe("AppSwagger", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("should not create or mount Swagger in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		const createDocument = vi.spyOn(SwaggerModule, "createDocument");
		const setup = vi.spyOn(SwaggerModule, "setup");

		expect({
			result: AppSwagger.setup({} as INestApplication),
			createCalls: createDocument.mock.calls,
			setupCalls: setup.mock.calls,
		}).toEqual({
			result: undefined,
			createCalls: [],
			setupCalls: [],
		});
	});

	it("should create and mount the complete application Swagger document", async () => {
		vi.stubEnv("NODE_ENV", "test");
		const module = await Test.createTestingModule({ controllers: [SwaggerFactoryTestController] }).compile();
		const app = module.createNestApplication(new FastifyAdapter());
		const setup = vi.spyOn(SwaggerModule, "setup");

		const document = AppSwagger.setup(app);

		await app.close();

		expect({
			title: document?.info.title,
			zodInput: document?.paths["/swagger-factory/zod"]?.post?.requestBody,
			zodOutput: document?.paths["/swagger-factory/zod"]?.post?.responses["200"],
			alternativeInput: document?.paths["/swagger-factory/alternative"]?.post?.requestBody,
			schemas: document?.components?.schemas,
			securitySchemes: document?.components?.securitySchemes,
			setupPath: setup.mock.calls[0]?.[0],
			setupUsesApp: setup.mock.calls[0]?.[1] === app,
			setupUsesDocument: setup.mock.calls[0]?.[2] === document,
		}).toEqual({
			title: "Cataquí API",
			zodInput: {
				required: true,
				content: { "application/json": { schema: { $ref: "#/components/schemas/SwaggerFactoryInput" } } },
			},
			zodOutput: {
				description: "",
				content: { "application/json": { schema: { $ref: "#/components/schemas/SwaggerFactoryOutput" } } },
			},
			alternativeInput: {
				required: true,
				content: { "application/json": { schema: { type: "string" } } },
			},
			schemas: {
				SwaggerFactoryInput: {
					type: "object",
					properties: { name: { type: "string" } },
					required: ["name"],
				},
				SwaggerFactoryOutput: { type: "number" },
			},
			securitySchemes: {
				bearer: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "Opaque",
					description: "Opaque Cataquí access token returned by authentication session endpoints.",
				},
			},
			setupPath: "docs",
			setupUsesApp: true,
			setupUsesDocument: true,
		});
	});
});
