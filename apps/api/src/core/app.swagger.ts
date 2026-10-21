import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import type { ZodType } from "zod";
import { createSchema } from "zod-openapi";
import { runtimeConfig, type RuntimeConfig } from "./config/runtime.config";

function setup(app: INestApplication): OpenAPIObject | undefined {
	if (app.get<RuntimeConfig>(runtimeConfig.KEY).environment === "production") return undefined;

	const document = SwaggerModule.createDocument(
		app,
		new DocumentBuilder()
			.setTitle("Cataquí API")
			.setVersion("1.0")
			.addBearerAuth({
				type: "http",
				scheme: "bearer",
				bearerFormat: "Opaque",
				description: "Opaque Cataquí access token returned by authentication session endpoints.",
			})
			.build(),
		{
			standardSchemaConverter: (schema, { schemaType }) => {
				if (
					typeof schema !== "object" ||
					schema === null ||
					!("~standard" in schema) ||
					typeof schema["~standard"] !== "object" ||
					schema["~standard"] === null ||
					!("vendor" in schema["~standard"]) ||
					schema["~standard"].vendor !== "zod"
				)
					return undefined;

				const convertedSchema = createSchema(schema as ZodType, {
					io: schemaType,
					openapiVersion: "3.0.0",
				});

				return {
					schema: convertedSchema.schema,
					components: convertedSchema.components,
				};
			},
		},
	);

	SwaggerModule.setup("docs", app, document);

	return document;
}

export const AppSwagger = {
	setup: setup,
} as const;
