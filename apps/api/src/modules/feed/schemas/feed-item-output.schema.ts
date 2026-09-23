import { z } from "zod";
import { FeedLocationOutputSchema } from "./feed-location-output.schema";

export const FeedItemOutputSchema = z
	.object({
		jobId: z.string().describe("Job unique identifier"),
		title: z.string().describe("Job title"),
		createdAt: z.iso.datetime().describe("ISO 8601 creation timestamp"),
		descriptionSummary: z
			.string()
			.describe("Short worker-focused pitch with the most decision-useful grounded details from the post"),
		payment: z.string().nullable().describe("Payment text derived from the job description, or null when unavailable"),
		location: FeedLocationOutputSchema.describe("Job location"),
	})
	.strict()
	.meta({ id: "FeedItemOutput" });
