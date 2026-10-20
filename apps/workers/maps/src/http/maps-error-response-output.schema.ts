import { createErrorResponseSchema } from "@cataqui/response";
import { z } from "zod";
import { MapsErrorCode } from "../errors/maps-error-code.enum";

export const MapsErrorResponseOutputSchema = createErrorResponseSchema({
	errorCodeSchema: z.enum(MapsErrorCode),
}).meta({ id: "HttpErrorOutput" });
