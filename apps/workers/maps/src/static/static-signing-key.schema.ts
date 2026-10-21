import { Buffer } from "node:buffer";
import { z } from "zod";

export const StaticSigningKeySchema = z
	.base64url()
	.length(43)
	.refine((value) => {
		const bytes = Buffer.from(value, "base64url");
		return bytes.toString("base64url") === value;
	});
