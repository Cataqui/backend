import { z } from "zod";
import { JobStatus } from "../../../../generated/prisma/client";
import { ContactOutputSchema } from "../../contact/schemas/contact-output.schema";
import { ProfileJobLocationOutputSchema } from "./profile-job-location-output.schema";

export const ProfileJobOutputSchema = z
	.object({
		jobId: z.uuid().describe("Job unique identifier"),
		description: z.string().describe("Detailed description about the job"),
		contact: ContactOutputSchema.nullable().describe("The job contact, or null if its saved contact was removed"),
		location: ProfileJobLocationOutputSchema.describe("Selected title and fuzzy public location"),
		status: z.enum([JobStatus.ACTIVE, JobStatus.ARCHIVED]).describe("Job lifecycle status"),
		createdAt: z.iso.datetime().describe("ISO 8601 timestamp of job creation"),
		updatedAt: z.iso.datetime().describe("ISO 8601 timestamp of the last job update"),
	})
	.strict()
	.meta({ id: "ProfileJobOutput" });
