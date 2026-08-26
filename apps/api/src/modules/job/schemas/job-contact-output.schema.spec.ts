import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactOutputSchema } from "./job-contact-output.schema";

describe("JobContactOutputSchema", () => {
	it.each(Object.values(JobContactMethod))("should serialize the %s contact method", (contactMethod) => {
		expect(JobContactOutputSchema.parse({ contactMethod: contactMethod, identifier: "+5511999999999" })).toEqual({
			contactMethod: contactMethod,
			identifier: "+5511999999999",
		});
	});
});
