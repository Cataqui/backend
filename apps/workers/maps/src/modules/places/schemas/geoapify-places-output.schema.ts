import { z } from "zod";

export const GeoapifyPlacesOutputSchema = z.object({ features: z.array(z.unknown()) });
