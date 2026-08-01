import { z } from "zod";

export const DeriveJobDataMessageSchema = z
	.object({
		job_id: z.string().uuid(),
	})
	.strict();

export type DeriveJobDataMessage = z.infer<typeof DeriveJobDataMessageSchema>;
