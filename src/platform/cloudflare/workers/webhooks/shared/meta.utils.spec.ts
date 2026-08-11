import { isWebhookFromMeta } from "./meta.utils";

const rawBody = new TextEncoder().encode("what do ya want for nothing?");
const appSecret = "Jefe";
const validWebhookSignature = "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

describe("isWebhookFromMeta", () => {
	it("should accept a valid HMAC-SHA256 webhook signature", async () => {
		await expect(
			isWebhookFromMeta({
				rawBody: rawBody,
				webhookSignature: validWebhookSignature,
				appSecret: appSecret,
			}),
		).resolves.toBe(true);
	});

	it("should reject a valid signature for a different raw body", async () => {
		await expect(
			isWebhookFromMeta({
				rawBody: new TextEncoder().encode("what do ya want for something else?"),
				webhookSignature: validWebhookSignature,
				appSecret: appSecret,
			}),
		).resolves.toBe(false);
	});

	it("should reject a well-formed signature with a different HMAC", async () => {
		await expect(
			isWebhookFromMeta({
				rawBody: rawBody,
				webhookSignature: `sha256=${"0".repeat(64)}`,
				appSecret: appSecret,
			}),
		).resolves.toBe(false);
	});

	it.each([
		["missing signature", null],
		["empty signature", ""],
		["wrong algorithm prefix", `sha512=${"0".repeat(64)}`],
		["uppercase prefix", `SHA256=${"0".repeat(64)}`],
		["uppercase hex", "sha256=5BDCC146BF60754E6A042426089575C75A003F089D2739839DEC58B964EC3843"],
		["short hex", `sha256=${"0".repeat(63)}`],
		["long hex", `sha256=${"0".repeat(65)}`],
		["non-hex character", `sha256=${"0".repeat(63)}g`],
		["surrounding whitespace", ` sha256=${"0".repeat(64)} `],
	])("should reject a malformed %s", async (_description, webhookSignature) => {
		await expect(
			isWebhookFromMeta({
				rawBody: rawBody,
				webhookSignature: webhookSignature,
				appSecret: appSecret,
			}),
		).resolves.toBe(false);
	});
});
