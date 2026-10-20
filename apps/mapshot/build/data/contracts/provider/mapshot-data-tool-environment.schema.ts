import { z } from "zod";

export const MapshotDataToolEnvironmentSchema = z.strictObject({
	accountId: z.string().regex(/^[a-f0-9]{32}$/),
	accessKeyId: z.string().min(1),
	secretAccessKey: z.string().min(1),
});
