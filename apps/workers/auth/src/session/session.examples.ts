import type { z } from "zod";
import { SessionOutputSchema } from "./session-output.schema";

export const issuedSessionExample = {
	accessToken: "A".repeat(43),
	tokenType: "Bearer",
	expiresAt: "2026-10-30T12:15:00.000Z",
	refreshToken: "example-refresh-token",
	refreshExpiresAt: "2026-11-29T12:00:00.000Z",
	accountId: "00000000-0000-4000-8000-000000000001",
} satisfies z.output<typeof SessionOutputSchema>;
