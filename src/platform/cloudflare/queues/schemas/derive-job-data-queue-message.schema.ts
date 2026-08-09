import { z } from "zod";

export const DeriveJobDataQueueMessageSchema = z.union([
	z.object({ jobId: z.uuid() }).strict(),
	z
		.object({ job_id: z.uuid() })
		.strict()
		.transform((message) => ({ jobId: message.job_id })),
]);
