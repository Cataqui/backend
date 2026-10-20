import { ContactMethod } from "../../../../generated/prisma/client";
import { ContactOutputSchema } from "./contact-output.schema";

describe("ContactOutputSchema", () => {
	it.each(Object.values(ContactMethod))("should serialize the %s contact method", (method) => {
		expect(ContactOutputSchema.parse({ method: method, identifier: "+5511999999999" })).toEqual({
			method: method,
			identifier: "+5511999999999",
		});
	});
});
