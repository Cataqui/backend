import { z } from "zod";

export const GeoapifyPlacesSchema = z.object({ features: z.array(z.unknown()) });
