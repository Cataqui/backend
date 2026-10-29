import fc from "fast-check";
import { AccountAdmission } from "../../../../generated/prisma/enums";
import { AccountOutputSchema } from "./account-output.schema";

it("serializes the complete account contract", () => {
	fc.assert(
		fc.property(
			fc.uuid(),
			fc.constantFrom(...Object.values(AccountAdmission)),
			fc.boolean(),
			(id, admission, completed) => {
				const output = { id: id, admission: admission, onboardingCompleted: completed };
				expect(AccountOutputSchema.parse(output)).toEqual(output);
			},
		),
	);
});

it.each([
	{},
	{ id: "invalid", admission: AccountAdmission.WAITLISTED, onboardingCompleted: false },
	{ id: "00000000-0000-4000-8000-000000000001", admission: "UNKNOWN", onboardingCompleted: false },
	{ id: "00000000-0000-4000-8000-000000000001", admission: AccountAdmission.WAITLISTED, onboardingCompleted: "false" },
	{
		id: "00000000-0000-4000-8000-000000000001",
		admission: AccountAdmission.WAITLISTED,
		onboardingCompleted: false,
		extra: true,
	},
])("rejects incomplete or undeclared account output: %j", (output) => {
	expect(AccountOutputSchema.safeParse(output).success).toBe(false);
});
