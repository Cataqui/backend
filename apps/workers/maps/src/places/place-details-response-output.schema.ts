import { createSuccessResponseSchema } from "@cataqui/response";
import type { z } from "zod";
import { PlaceDetailsOutputSchema } from "./place-details-output.schema";

export const PlaceDetailsResponseOutputSchema = createSuccessResponseSchema({ dataSchema: PlaceDetailsOutputSchema });
export type PlaceDetailsResponseOutput = z.infer<typeof PlaceDetailsResponseOutputSchema>;
