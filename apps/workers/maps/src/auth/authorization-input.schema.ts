import { z } from "zod";

export const AuthorizationInputSchema = z
	.string()
	.regex(/^Bearer [A-Za-z0-9_-]{43}$/i)
	.transform((authorization) => authorization.slice(7));
