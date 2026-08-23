import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { JobContactReferenceOutputSchema } from "./job-contact-reference-output.schema";

describe("JobContactReferenceOutputSchema", () => {
	it("should serialize the public contact reference", () => {
		expect(
			JobContactReferenceOutputSchema.parse({
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				contactMethod: JobContactMethod.WHATSAPP,
			}),
		).toEqual({ contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", contactMethod: JobContactMethod.WHATSAPP });
	});

	it("should reject database-only contact fields", () => {
		expect(() =>
			JobContactReferenceOutputSchema.parse({
				contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "+5511999999999",
			}),
		).toThrow();
	});
});
