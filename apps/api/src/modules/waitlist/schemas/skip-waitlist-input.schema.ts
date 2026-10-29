import { z } from "zod";

export const SkipWaitlistInputSchema = z
	.strictObject({
		inviteCode: z
			.string()
			.trim()
			.min(1, { error: "inviteCode must contain at least one letter, digit, or hyphen; example: RYAN-2026" })
			.max(64, { error: "inviteCode must contain at most 64 characters after trimming" })
			.regex(/^[A-Za-z0-9-]+$/, {
				error: "inviteCode must contain only ASCII letters, digits, or hyphens; example: RYAN-2026",
			})
			.toUpperCase()
			.describe("Invite code used to skip the waitlist; case-insensitive and trimmed before use."),
	})
	.meta({ id: "SkipWaitlistInput" });
