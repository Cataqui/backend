import { z } from "zod";

export const HealthOutputSchema = z.strictObject({ status: z.literal("ok") });
