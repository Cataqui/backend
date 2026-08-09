export async function isWebhookFromMeta(params: {
	rawBody: Uint8Array;
	webhookSignature: string | null;
	appSecret: string;
}): Promise<boolean> {
	const encoder = new TextEncoder();
	const hmacKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(params.appSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const expectedHmac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, params.rawBody));
	const expectedSignature = `sha256=${[...expectedHmac].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;

	const [expectedDigest, providedDigest] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(expectedSignature)),
		crypto.subtle.digest("SHA-256", encoder.encode(params.webhookSignature ?? "")),
	]);

	return crypto.subtle.timingSafeEqual(expectedDigest, providedDigest);
}
