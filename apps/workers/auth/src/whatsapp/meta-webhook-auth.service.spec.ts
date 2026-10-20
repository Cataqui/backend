import { Buffer } from "node:buffer";
import * as td from "testdouble";
import { MetaWebhookAuthService } from "./meta-webhook-auth.service";

const rawBody = new TextEncoder().encode("what do ya want for nothing?");
const appSecret = "Jefe";
const validWebhookSignature = "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";

describe("MetaWebhookAuthService", () => {
	const service = new MetaWebhookAuthService({ appSecret: appSecret, verificationToken: "verify-token" });
	const originalFromHex = Object.getOwnPropertyDescriptor(Uint8Array, "fromHex");
	const originalTimingSafeEqual = Object.getOwnPropertyDescriptor(crypto.subtle, "timingSafeEqual");
	const fromHex = td.func<Uint8ArrayConstructor["fromHex"]>();
	const timingSafeEqual = td.func<SubtleCrypto["timingSafeEqual"]>();

	afterEach(() => td.reset());

	beforeAll(() => {
		Object.defineProperty(Uint8Array, "fromHex", { configurable: true, value: fromHex });
		Object.defineProperty(crypto.subtle, "timingSafeEqual", { configurable: true, value: timingSafeEqual });
	});

	afterAll(() => {
		if (originalFromHex === undefined) Reflect.deleteProperty(Uint8Array, "fromHex");
		else Object.defineProperty(Uint8Array, "fromHex", originalFromHex);
		if (originalTimingSafeEqual === undefined) Reflect.deleteProperty(crypto.subtle, "timingSafeEqual");
		else Object.defineProperty(crypto.subtle, "timingSafeEqual", originalTimingSafeEqual);
	});

	beforeEach(() => {
		td.when(fromHex(validWebhookSignature.slice(7))).thenReturn(Buffer.from(validWebhookSignature.slice(7), "hex"));
		td.when(fromHex("0".repeat(64))).thenReturn(new Uint8Array(32));
		td.when(timingSafeEqual(td.matchers.anything(), td.matchers.anything())).thenReturn(true);
	});

	it("returns the subscription challenge after comparing equal-length token digests", async () => {
		await expect(
			service.getSubscriptionChallengeOrNull({
				challenge: "challenge-value",
				mode: "subscribe",
				receivedVerificationToken: "verify-token",
			}),
		).resolves.toBe("challenge-value");
		expect(td.explain(timingSafeEqual).calls[0]?.args.map((value) => value.byteLength)).toEqual([32, 32]);
	});

	it.each([
		{ mode: "unsubscribe", challenge: "challenge-value", receivedVerificationToken: "verify-token", equal: true },
		{ mode: "subscribe", challenge: null, receivedVerificationToken: "verify-token", equal: true },
		{ mode: "subscribe", challenge: "challenge-value", receivedVerificationToken: "wrong", equal: false },
		{ mode: "subscribe", challenge: "challenge-value", receivedVerificationToken: null, equal: false },
	])("rejects an unapproved subscription request: %j", async (params) => {
		td.when(timingSafeEqual(td.matchers.anything(), td.matchers.anything())).thenReturn(params.equal);

		await expect(
			service.getSubscriptionChallengeOrNull({
				challenge: params.challenge,
				mode: params.mode,
				receivedVerificationToken: params.receivedVerificationToken,
			}),
		).resolves.toBeNull();
	});

	it("should accept a valid HMAC-SHA256 webhook signature", async () => {
		await expect(
			service.isWebhookFromMeta({
				rawBody: rawBody,
				webhookSignature: validWebhookSignature,
			}),
		).resolves.toBe(true);
	});

	it("should reject a valid signature for a different raw body", async () => {
		await expect(
			service.isWebhookFromMeta({
				rawBody: new TextEncoder().encode("what do ya want for something else?"),
				webhookSignature: validWebhookSignature,
			}),
		).resolves.toBe(false);
	});

	it("should reject a well-formed signature with a different HMAC", async () => {
		await expect(
			service.isWebhookFromMeta({
				rawBody: rawBody,
				webhookSignature: `sha256=${"0".repeat(64)}`,
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
			service.isWebhookFromMeta({
				rawBody: rawBody,
				webhookSignature: webhookSignature,
			}),
		).resolves.toBe(false);
	});
});
