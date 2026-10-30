import { z } from "zod";

export const NameAnalysisInputSchema = z.strictObject({ name: z.string().trim().min(1).max(100) });
