import { z } from "zod";

export const WorkerCallInputSchema = z.strictObject({
	method: z.string().min(1),
	input: z.unknown(),
});
