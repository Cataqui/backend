import { Buffer } from "node:buffer";
import { StaticSigningKeySchema } from "./static-signing-key.schema";
it("accepts a canonical 32-byte Base64URL signing key", () => {
	const key = Buffer.alloc(32, 123).toString("base64url");
	expect(StaticSigningKeySchema.parse(key)).toBe(key);
});
it.each(["", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "B", "A".repeat(42) + "+"])(
	"rejects an invalid signing key",
	(key) => {
		expect(StaticSigningKeySchema.safeParse(key).success).toBe(false);
	},
);
