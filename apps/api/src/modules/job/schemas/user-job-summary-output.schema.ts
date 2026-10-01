import { z } from "zod";
import { JobStatus } from "../../../../generated/prisma/client.js";
import { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";

export const UserJobSummaryOutputSchema = z
	.object({
		jobId: z.uuid(),
		title: z.string(),
		descriptionSummary: z.string(),
		payment: z.string().nullable(),
		location: FuzzyJobLocationOutputSchema.describe("Fuzzy public job location"),
		status: z.enum([JobStatus.ACTIVE, JobStatus.ARCHIVED]),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.strict()
	.meta({ id: "UserJobSummaryOutput" });
