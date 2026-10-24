import { createSuccessResponseSchema } from "@cataqui/response";
import { NameMeaningOutputSchema } from "./name-meaning-output.schema";

export const NameMeaningResponseOutputSchema = createSuccessResponseSchema({ dataSchema: NameMeaningOutputSchema });
