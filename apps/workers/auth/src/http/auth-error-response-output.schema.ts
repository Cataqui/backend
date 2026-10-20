import { createErrorResponseSchema } from "@cataqui/response";
import { z } from "zod";
import { AppErrorCode } from "../errors/app-error-code.enum";

export const AuthErrorResponseOutputSchema = createErrorResponseSchema({
	errorCodeSchema: z.enum(AppErrorCode),
}).meta({ id: "HttpErrorOutput" });
