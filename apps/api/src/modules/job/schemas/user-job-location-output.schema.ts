import { z } from "zod";
import { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";

export const UserJobLocationOutputSchema = FuzzyJobLocationOutputSchema.extend({
	title: z.string().describe("Selected display title for the job location"),
}).meta({ id: "UserJobLocationOutput" });
