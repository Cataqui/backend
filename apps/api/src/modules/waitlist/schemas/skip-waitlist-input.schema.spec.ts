import fc from "fast-check";
import { SkipWaitlistInputSchema } from "./skip-waitlist-input.schema";

describe("SkipWaitlistInputSchema", () => {
	it("normalizes invite codes before skipping the waitlist", () => {
		expect(SkipWaitlistInputSchema.parse({ inviteCode: "  ryan-2026  " })).toEqual({ inviteCode: "RYAN-2026" });
	});
	it.each([undefined, null, 123, "", " ", "A".repeat(65), "CODE_1", "café", "A B"])(
		"rejects invalid invite code %j",
		(code) => {
			expect(SkipWaitlistInputSchema.safeParse({ inviteCode: code }).success).toBe(false);
		},
	);
	it("rejects a caller-selected account or admission", () => {
		expect(
			SkipWaitlistInputSchema.safeParse({ inviteCode: "CODE", accountId: "other", admission: "ADMITTED" }).success,
		).toBe(false);
	});
	it("accepts codes throughout the allowed alphabet and length", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-"), {
					minLength: 1,
					maxLength: 64,
				}),
				(letters) => {
					const code = letters.join("");
					return SkipWaitlistInputSchema.parse({ inviteCode: ` ${code} ` }).inviteCode === code.toUpperCase();
				},
			),
		);
	});
});
