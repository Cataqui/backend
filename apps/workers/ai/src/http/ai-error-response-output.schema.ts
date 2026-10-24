import { createErrorResponseSchema } from "@cataqui/response";
import { z } from "zod";
import { AiErrorCode } from "../errors/ai-error-code.enum";

export const AiErrorResponseOutputSchema = createErrorResponseSchema({
	errorCodeSchema: z.enum(AiErrorCode),
});
