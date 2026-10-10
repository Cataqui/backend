import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import { MapsErrorOutputSchema } from "./maps-error-output.schema";
import type { MapsErrorCode } from "./maps-error-code.enum";
import type { IMapsHonoEnvironment } from "./maps-hono-environment.interface";

export function createMapsErrorResponse(params: {
	context: Context<IMapsHonoEnvironment>;
	errorCode: MapsErrorCode;
	message: string;
	status: ContentfulStatusCode;
	headers?: Record<string, string>;
	violations?: { path: string; message: string }[];
}): Response {
	const output: z.infer<typeof MapsErrorOutputSchema> = MapsErrorOutputSchema.parse({
		errorCode: params.errorCode,
		message: params.message,
		...(params.violations === undefined ? {} : { violations: params.violations }),
	});

	return params.context.json(output, params.status, params.headers);
}
