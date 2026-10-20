import { z } from "zod";
import { PlaceSearchLanguageSchema } from "./place-search-language.schema";

export const PlaceSearchHeadersInputSchema = z.object({
	"accept-language": PlaceSearchLanguageSchema.describe(
		"Required language tag used to localize place search results. Preference lists use their first language tag. Missing, blank, or invalid primary tags return INVALID_REQUEST with a headers.Accept-Language violation.",
	).meta({ examples: ["pt-BR"] }),
});
