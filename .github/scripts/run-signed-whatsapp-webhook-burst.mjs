import { createHmac } from "node:crypto";

const requestCount = 320;
const concurrency = 20;
const requestResults = [];
let nextRequestIndex = 0;

if (process.env.META_APP_SECRET === undefined || process.env.META_APP_SECRET.length === 0) {
	throw new Error("META_APP_SECRET is required");
}

async function sendSignedWebhook({ requestIndex }) {
	const requestBody = JSON.stringify({
		object: "whatsapp_business_account",
		entry: [
			{
				id: "waba-staging-synchronous-proof",
				changes: [
					{
						field: "messages",
						value: {
							messaging_product: "whatsapp",
							metadata: {
								display_phone_number: "+55 11 0000-0000",
								phone_number_id: "1211194405413752",
							},
							contacts: [
								{
									profile: { name: "Cataqui Synchronous Proof", username: "cataqui.synchronous-proof" },
									user_id: "user.synchronous-proof",
								},
							],
							messages: [
								{
									id: `wamid.synchronous-proof-${Date.now()}-${requestIndex}`,
									from_user_id: "user.synchronous-proof",
									timestamp: String(Math.floor(Date.now() / 1000)),
									type: "text",
									text: { body: "AUTH-0000000000" },
								},
							],
						},
					},
				],
			},
		],
	});
	const requestSignature = createHmac("sha256", process.env.META_APP_SECRET).update(requestBody).digest("hex");
	const requestStartedAt = performance.now();
	const response = await fetch("https://staging.webhooks.cataqui.com/whatsapp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-hub-signature-256": `sha256=${requestSignature}`,
		},
		body: requestBody,
	});

	await response.arrayBuffer();
	requestResults.push({ status: response.status, durationMilliseconds: performance.now() - requestStartedAt });
}

async function runBurstWorker() {
	while (true) {
		const requestIndex = nextRequestIndex;
		nextRequestIndex += 1;

		if (requestIndex >= requestCount) return;

		await sendSignedWebhook({ requestIndex: requestIndex });
	}
}

await Promise.all(Array.from({ length: concurrency }, () => runBurstWorker()));

const responseCountsByStatus = Object.fromEntries(
	[...new Set(requestResults.map((requestResult) => requestResult.status))]
		.sort((firstStatus, secondStatus) => firstStatus - secondStatus)
		.map((status) => [status, requestResults.filter((requestResult) => requestResult.status === status).length]),
);
const sortedDurations = requestResults
	.map((requestResult) => requestResult.durationMilliseconds)
	.sort((firstDuration, secondDuration) => firstDuration - secondDuration);
const getPercentile = ({ percentile }) =>
	sortedDurations[Math.min(sortedDurations.length - 1, Math.ceil(sortedDurations.length * percentile) - 1)];
const summary = {
	requestCount: requestResults.length,
	concurrency: concurrency,
	responseCountsByStatus: responseCountsByStatus,
	durationMilliseconds: {
		p50: Math.round(getPercentile({ percentile: 0.5 })),
		p95: Math.round(getPercentile({ percentile: 0.95 })),
		p99: Math.round(getPercentile({ percentile: 0.99 })),
		max: Math.round(sortedDurations.at(-1)),
	},
};

console.log(JSON.stringify(summary, null, 2));

if (responseCountsByStatus[200] !== requestCount) {
	throw new Error("Every signed webhook request must return 200");
}

if (summary.durationMilliseconds.max >= 30_000) {
	throw new Error("The signed webhook burst exceeded the 30-second mobile exchange window");
}
