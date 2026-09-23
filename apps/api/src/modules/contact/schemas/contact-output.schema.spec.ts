import { ContactMethod } from "../../../../generated/prisma/client.js";
import { ContactOutputSchema } from "./contact-output.schema";

describe("ContactOutputSchema", () => {
	it.each(Object.values(ContactMethod))("should serialize the %s contact method", (contactMethod) => {
		expect(ContactOutputSchema.parse({ contactMethod: contactMethod, identifier: "+5511999999999" })).toEqual({
			contactMethod: contactMethod,
			identifier: "+5511999999999",
		});
	});
});
