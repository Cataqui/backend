import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import { GeosearchErrorOutputSchema } from "./geosearch-error-output.schema";
import { GeosearchErrorCode } from "./geosearch-error-code.enum";
import type { IGeosearchHonoEnvironment } from "./geosearch-hono-environment.interface";

export function createGeosearchErrorResponse(
	context: Context<IGeosearchHonoEnvironment>,
	params: {
		errorCode: GeosearchErrorCode;
		message: string;
		status: ContentfulStatusCode;
		headers?: Record<string, string>;
	},
): Response {
	const output: z.infer<typeof GeosearchErrorOutputSchema> = GeosearchErrorOutputSchema.parse({
		errorCode: params.errorCode,
		message: params.message,
	});

	return context.json(output, params.status, params.headers);
}
