import { z } from "zod";

export const NameMeaningOutputSchema = z.strictObject({ meaning: z.string().trim().min(1).max(160).nullable() });
export type NameMeaningOutput = z.infer<typeof NameMeaningOutputSchema>;
