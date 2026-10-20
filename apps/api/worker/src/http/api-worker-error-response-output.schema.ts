import { createErrorResponseSchema } from "@cataqui/response";
import { z } from "zod";
import { ApiWorkerErrorCode } from "./api-worker-error-code.enum";

export const ApiWorkerErrorResponseOutputSchema = createErrorResponseSchema({
	errorCodeSchema: z.enum(ApiWorkerErrorCode),
}).meta({ id: "HttpErrorOutput" });
