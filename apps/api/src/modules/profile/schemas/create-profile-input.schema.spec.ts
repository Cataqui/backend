import fc from "fast-check";
import { CreateProfileInputSchema } from "./create-profile-input.schema";

describe("CreateProfileInputSchema", () => {
	it("rejects invite codes because redemption belongs to the waitlist operation", () => {
		expect(CreateProfileInputSchema.safeParse({ name: "Maria", initialContacts: [], inviteCode: "CODE" }).success).toBe(
			false,
		);
	});
	it("trims the onboarding name and contact identifier at ingress", () => {
		expect(
			CreateProfileInputSchema.parse({
				name: "  Maria  ",
				initialContacts: [{ method: "WHATSAPP", identifier: "  @maria.silva  " }],
			}),
		).toEqual({ name: "Maria", initialContacts: [{ method: "WHATSAPP", identifier: "@maria.silva" }] });
	});
	it("accepts an empty initial contact list", () => {
		expect(CreateProfileInputSchema.parse({ name: "Maria", initialContacts: [] })).toEqual({
			name: "Maria",
			initialContacts: [],
		});
	});
	it.each(["", " ", "\t\n", "a".repeat(321)])("rejects a name outside the supported nonempty length: %j", (name) => {
		expect(CreateProfileInputSchema.safeParse({ name: name, initialContacts: [] }).success).toBe(false);
	});
	it("accepts names throughout the supported length range", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 320 }),
				(length) => CreateProfileInputSchema.safeParse({ name: "a".repeat(length), initialContacts: [] }).success,
			),
		);
	});
	it("uses the contact capability to reject invalid contact details", () => {
		expect(
			CreateProfileInputSchema.safeParse({
				name: "Maria",
				initialContacts: [{ method: "PHONE_CALL", identifier: "maria" }],
			}).success,
		).toBe(false);
	});
	it("does not accept a caller-selected profile identifier", () => {
		expect(
			CreateProfileInputSchema.safeParse({ name: "Maria", initialContacts: [], profileId: "another-account" }).success,
		).toBe(false);
	});
});
