import * as td from "testdouble";
import type { INestApplication } from "@nestjs/common";
import { type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { z } from "zod";
import { createSchema } from "zod-openapi";
import { AppSwagger } from "./app.swagger";
import { runtimeConfig } from "./config/runtime.config";

afterEach(() => td.reset());

vi.mock("zod-openapi", async () => {
	const td = await import("testdouble");
	return { createSchema: td.func<typeof createSchema>() };
});

function _application(environment: string | undefined): INestApplication {
	const app = td.object<INestApplication>();
	td.when(app.get(runtimeConfig.KEY)).thenReturn({ environment: environment });
	return app;
}

function _setup(): {
	app: INestApplication;
	document: OpenAPIObject;
	createDocument: typeof SwaggerModule.createDocument;
	mount: typeof SwaggerModule.setup;
	result: ReturnType<typeof AppSwagger.setup>;
	converter: NonNullable<NonNullable<Parameters<typeof SwaggerModule.createDocument>[2]>["standardSchemaConverter"]>;
} {
	const app = _application("development");
	const document = {
		openapi: "3.0.0",
		info: { title: "Cataquí API", version: "1.0" },
		paths: {},
	} satisfies OpenAPIObject;
	const createDocument = td.replace(SwaggerModule, "createDocument");
	td.when(createDocument(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReturn(document);
	const mount = td.replace(SwaggerModule, "setup");
	const result = AppSwagger.setup(app);
	const options: Parameters<typeof SwaggerModule.createDocument>[2] = td.explain(createDocument).calls[0]?.args[2];
	const converter = options?.standardSchemaConverter;
	if (converter === undefined) throw new Error("The application did not configure its schema converter.");
	return {
		app: app,
		document: document,
		createDocument: createDocument,
		mount: mount,
		result: result,
		converter: converter,
	};
}

describe("AppSwagger", () => {
	afterEach(() => vi.unstubAllEnvs());

	it.each(["staging", "production", undefined])(
		"keeps documentation disabled for %s using application configuration",
		(environment) => {
			vi.stubEnv("ENVIRONMENT", "development");
			const app = _application(environment);
			const createDocument = td.replace(SwaggerModule, "createDocument");
			const mount = td.replace(SwaggerModule, "setup");
			const result = AppSwagger.setup(app);
			expect({
				result: result,
				configurationCalls: td.explain(app.get).calls.map((call) => call.args),
				documentCalls: td.explain(createDocument).callCount,
				mountCalls: td.explain(mount).callCount,
			}).toEqual({ result: undefined, configurationCalls: [[runtimeConfig.KEY]], documentCalls: 0, mountCalls: 0 });
		},
	);

	it("registers the API documentation configuration and mounts the returned document", () => {
		vi.stubEnv("ENVIRONMENT", "production");
		const setup = _setup();
		const createCalls = td.explain(setup.createDocument).calls;
		const mountCalls = td.explain(setup.mount).calls;
		expect({
			resultMatches: setup.result === setup.document,
			createCalls: createCalls.map((call) => ({
				appMatches: call.args[0] === setup.app,
				document: call.args[1],
				converterMatches: call.args[2].standardSchemaConverter === setup.converter,
			})),
			mountCalls: mountCalls.map((call) => ({
				path: call.args[0],
				appMatches: call.args[1] === setup.app,
				documentMatches: call.args[2] === setup.document,
			})),
		}).toEqual({
			resultMatches: true,
			createCalls: [
				{
					appMatches: true,
					document: expect.objectContaining({
						info: expect.objectContaining({ title: "Cataquí API", version: "1.0" }),
						components: {
							securitySchemes: {
								bearer: {
									type: "http",
									scheme: "bearer",
									bearerFormat: "Opaque",
									description: "Opaque Cataquí access token returned by authentication session endpoints.",
								},
							},
						},
					}),
					converterMatches: true,
				},
			],
			mountCalls: [{ path: "docs", appMatches: true, documentMatches: true }],
		});
	});

	it.each(["input", "output"] as const)(
		"passes %s schema conversion to the configured Zod integration",
		(schemaType) => {
			const setup = _setup();
			const schema = z.object({ name: z.string() });
			const converted = {
				schema: { $ref: "#/components/schemas/Example" },
				components: { Example: { type: "string" as const } },
			} satisfies ReturnType<typeof createSchema>;
			td.when(createSchema(td.matchers.anything(), td.matchers.anything())).thenReturn(converted);
			const result = setup.converter(schema, { schemaType: schemaType });
			expect({ result: result, conversionCalls: td.explain(createSchema).calls.map((call) => call.args) }).toEqual({
				result: converted,
				conversionCalls: [[schema, { io: schemaType, openapiVersion: "3.0.0" }]],
			});
		},
	);

	it.each([
		undefined,
		null,
		"schema",
		{},
		{ "~standard": null },
		{ "~standard": "other" },
		{ "~standard": {} },
		{ "~standard": { vendor: "other" } },
	])("leaves unsupported schema %j to Swagger's public fallback", (schema) => {
		const setup = _setup();
		expect({
			result: setup.converter(schema, { schemaType: "input" }),
			conversionCalls: td.explain(createSchema).callCount,
		}).toEqual({ result: undefined, conversionCalls: 0 });
	});
});
