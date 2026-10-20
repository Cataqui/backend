import { createSuccessResponseSchema } from "@cataqui/response";
import type { z } from "zod";
import { PlaceSearchOutputSchema } from "./place-search-output.schema";

export const PlaceSearchResponseOutputSchema = createSuccessResponseSchema({ dataSchema: PlaceSearchOutputSchema });
export type PlaceSearchResponseOutput = z.infer<typeof PlaceSearchResponseOutputSchema>;
