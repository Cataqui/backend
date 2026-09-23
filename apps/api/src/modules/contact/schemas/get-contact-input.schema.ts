import { z } from "zod";

export const GetContactInputSchema = z
	.object({
		contactId: z.uuid().describe("Id of the contact to fetch."),
	})
	.strict()
	.meta({ id: "GetContactInput" });
