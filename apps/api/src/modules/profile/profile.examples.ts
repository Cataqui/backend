import type { z } from "zod";
import { ProfileOutputSchema } from "./schemas/profile-output.schema";

export const profileExample = {
	profileId: "00000000-0000-4000-8000-000000000001",
	name: "Maria Clara",
} satisfies z.output<typeof ProfileOutputSchema>;
