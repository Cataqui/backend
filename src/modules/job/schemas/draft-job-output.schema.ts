import { z } from "zod";
import { JobStatus, JobType } from "../../../../generated/prisma/client.js";
import { JobPaymentOutputSchema } from "../../../shared/schemas/job/job-payment-output.schema";
import { JobContactReferenceOutputSchema } from "./job-contact-reference-output.schema";
import { JobLocationOutputSchema } from "./job-location-output.schema";

export const DraftJobOutputSchema = z
	.object({
		jobId: z.uuid().describe("Job draft unique identifier"),
		title: z.string().nullable().describe("Short job title, or null while derived metadata is unavailable"),
		description: z.string().describe("Detailed description about the job draft"),
		descriptionSummary: z
			.string()
			.nullable()
			.describe("Worker-focused feed summary, or null while derived metadata is unavailable"),
		contactReference: JobContactReferenceOutputSchema.nullable().describe(
			"Reference to the job contact, or null until supplied",
		),
		location: JobLocationOutputSchema.nullable().describe("Where the job will be executed, or null until supplied"),
		payment: JobPaymentOutputSchema.nullable().describe("Job payment details, or null until supplied"),
		status: z.literal(JobStatus.DRAFT).describe("Draft lifecycle status"),
		type: z.enum(JobType).nullable().describe("Job engagement type, or null until supplied"),
		createdAt: z.iso.datetime().describe("ISO 8601 timestamp of job draft creation"),
		updatedAt: z.iso.datetime().describe("ISO 8601 timestamp of the last job draft update"),
	})
	.strict()
	.meta({ id: "DraftJobOutput" });
