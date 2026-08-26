import { JobContactMethod } from "../../../../generated/prisma/client.js";
import { SavedContactsOutputSchema } from "./saved-contacts-output.schema";

describe("SavedContactsOutputSchema", () => {
	it("should serialize a collection of saved contacts", () => {
		expect(
			SavedContactsOutputSchema.parse([
				{
					contactId: "550e8400-e29b-41d4-a716-446655440000",
					contactMethod: JobContactMethod.WHATSAPP,
					identifier: "@cataqui.poster",
				},
			]),
		).toEqual([
			{
				contactId: "550e8400-e29b-41d4-a716-446655440000",
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "@cataqui.poster",
			},
		]);
	});
});
