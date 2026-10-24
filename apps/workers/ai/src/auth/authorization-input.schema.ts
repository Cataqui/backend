import { z } from "zod";

export const AuthorizationInputSchema = z
	.string()
	.regex(/^Bearer [A-Za-z0-9_-]{43}$/i)
	.transform((value) => value.slice(7));
