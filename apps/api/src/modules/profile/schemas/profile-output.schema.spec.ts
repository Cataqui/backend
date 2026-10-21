import { ProfileOutputSchema } from "./profile-output.schema";

describe("ProfileOutputSchema", () => {
	it("returns the profile identity and onboarding name", () => {
		const output = { profileId: "f3f3f078-9332-4879-9904-6565abc5d88d", name: "Maria" };
		expect(ProfileOutputSchema.parse(output)).toEqual(output);
	});
	it("does not expose the private creation fingerprint", () => {
		expect(
			ProfileOutputSchema.safeParse({
				profileId: "f3f3f078-9332-4879-9904-6565abc5d88d",
				name: "Maria",
				creationHash: "internal",
			}).success,
		).toBe(false);
	});
});
