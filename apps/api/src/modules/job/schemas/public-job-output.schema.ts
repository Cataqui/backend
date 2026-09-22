import { z } from "zod";
import { JobStatus } from "../../../../generated/prisma/client.js";
import { JobContactReferenceOutputSchema } from "./job-contact-reference-output.schema";
import { JobLocationOutputSchema } from "./job-location-output.schema";

export const PublicJobOutputSchema = z
	.object({
		jobId: z.uuid().describe("Public job unique identifier"),
		title: z.string().describe("Short job title"),
		description: z.string().describe("Detailed description about the job"),
		descriptionSummary: z.string().describe("Worker-focused feed summary generated from the description"),
		contactReference: JobContactReferenceOutputSchema.describe("Reference used to identify the job contact"),
		location: JobLocationOutputSchema.describe("Where the job will be executed"),
		payment: z.string().describe("Payment text supplied by the poster"),
		status: z.enum([JobStatus.ACTIVE, JobStatus.CLOSED]).describe("Public job lifecycle status"),
		createdAt: z.iso.datetime().describe("ISO 8601 timestamp of job creation"),
		updatedAt: z.iso.datetime().describe("ISO 8601 timestamp of the last job update"),
	})
	.strict()
	.meta({ id: "PublicJobOutput" });
