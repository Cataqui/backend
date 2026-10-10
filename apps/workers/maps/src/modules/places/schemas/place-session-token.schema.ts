import { z } from "zod";

export const PlaceSessionTokenSchema = z
	.string()
	.min(1)
	.max(36)
	.regex(/^[A-Za-z0-9_-]+$/, "sessionToken must be URL-safe");
