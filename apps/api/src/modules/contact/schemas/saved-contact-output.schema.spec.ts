import { ContactMethod } from "../../../../generated/prisma/client.js";
import { SavedContactOutputSchema } from "./saved-contact-output.schema";

describe("SavedContactOutputSchema", () => {
	it("should serialize a saved contact", () => {
		expect(
			SavedContactOutputSchema.parse({
				contactId: "550e8400-e29b-41d4-a716-446655440000",
				contactMethod: ContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
			}),
		).toEqual({
			contactId: "550e8400-e29b-41d4-a716-446655440000",
			contactMethod: ContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
		});
	});
});
