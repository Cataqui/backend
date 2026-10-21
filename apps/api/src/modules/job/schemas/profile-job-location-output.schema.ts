import { z } from "zod";
import { FuzzyJobLocationOutputSchema } from "./fuzzy-job-location-output.schema";

export const ProfileJobLocationOutputSchema = FuzzyJobLocationOutputSchema.extend({
	title: z.string().describe("Selected display title for the job location"),
}).meta({ id: "ProfileJobLocationOutput" });
