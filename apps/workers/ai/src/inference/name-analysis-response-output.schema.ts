import { createSuccessResponseSchema } from "@cataqui/response";
import { NameAnalysisOutputSchema } from "./name-analysis-output.schema";

export const NameAnalysisResponseOutputSchema = createSuccessResponseSchema({ dataSchema: NameAnalysisOutputSchema });
