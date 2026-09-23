import { ContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactReferenceOutputSchema } from "./job-contact-reference-output.schema";

describe("JobContactReferenceOutputSchema", () => {
	it("should serialize the public contact reference", () => {
		expect(
			JobContactReferenceOutputSchema.parse({
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				method: ContactMethod.WHATSAPP,
			}),
		).toEqual({ contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", method: ContactMethod.WHATSAPP });
	});

	it("should reject database-only contact fields", () => {
		expect(() =>
			JobContactReferenceOutputSchema.parse({
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				method: ContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			}),
		).toThrow();
	});
});
