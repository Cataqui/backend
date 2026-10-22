import fc from "fast-check";
import { UpdateAccountMetadataInputSchema } from "./update-account-metadata-input.schema";

it("accepts boolean onboarding updates", () => {
	fc.assert(
		fc.property(fc.boolean(), (completed) => {
			const input = { onboardingCompleted: completed };
			expect(UpdateAccountMetadataInputSchema.parse(input)).toEqual(input);
		}),
	);
});

it("accepts an empty patch without supplying a default", () => {
	expect(UpdateAccountMetadataInputSchema.parse({})).toEqual({});
});

it.each([
	null,
	[],
	true,
	{ onboardingCompleted: null },
	{ onboardingCompleted: "true" },
	{ onboardingCompleted: 1 },
	{ accountId: "other" },
	{ onboardingCompleted: true, extra: false },
])("rejects invalid metadata updates: %j", (input) => {
	expect(UpdateAccountMetadataInputSchema.safeParse(input).success).toBe(false);
});
