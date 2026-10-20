import { createErrorResponseSchema } from "@cataqui/response";
import { z } from "zod";
import { ErrorCode } from "./error-code.enum";

export const ApiErrorResponseOutputSchema = createErrorResponseSchema({
	errorCodeSchema: z.enum(ErrorCode),
}).meta({ id: "HttpErrorOutput" });
