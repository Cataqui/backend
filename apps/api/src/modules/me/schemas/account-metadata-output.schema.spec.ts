import fc from "fast-check";
import { AccountMetadataOutputSchema } from "./account-metadata-output.schema";

it("serializes the complete camelCase metadata contract", () => {
	fc.assert(
		fc.property(fc.boolean(), (completed) => {
			const output = { onboardingCompleted: completed };
			expect(AccountMetadataOutputSchema.parse(output)).toEqual(output);
		}),
	);
});

it.each([
	{},
	{ onboardingCompleted: null },
	{ onboardingCompleted: "false" },
	{ onboardingCompleted: false, accountId: "private" },
])("rejects incomplete or undeclared metadata output: %j", (output) => {
	expect(AccountMetadataOutputSchema.safeParse(output).success).toBe(false);
});
