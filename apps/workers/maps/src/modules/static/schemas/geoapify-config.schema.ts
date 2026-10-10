import { z } from "zod";
export const GeoapifyConfigSchema = z.strictObject({ apiKey: z.string().min(1) });
