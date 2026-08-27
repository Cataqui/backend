const inboundCallMock = vi.hoisted(() => vi.fn());

vi.mock("@cataqui/api-internal-ingress", () => ({
	inboundCall: inboundCallMock,
}));

import { NotpRepository } from "./notp.repository";

describe("NotpRepository", () => {
	const message = {
		providerMessageId: "provider-message-id",
		providerSenderId: "provider-sender-id",
		providerContactIdentifier: "+5511999999999",
		notpCodeHash: "a".repeat(64),
	};

	beforeEach(() => {
		vi.restoreAllMocks();
		inboundCallMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	it("should deliver normalized messages through the private API Worker entrypoint", async () => {
		const apiWorker = {} as WebhooksWorkerEnv["API_WORKER"];
		inboundCallMock.mockResolvedValue(new Response(null, { status: 204 }));

		await new NotpRepository().verifyMessages({
			apiWorker: apiWorker,
			messages: [message],
			telemetry: {
				environment: "staging",
				requestId: "webhooks-request-id",
				serviceVersion: "webhooks-worker-version",
			},
		});

		expect(inboundCallMock).toHaveBeenCalledWith({
			worker: apiWorker,
			receiver: "verify-whatsapp-notp",
			body: message,
		});
	});

	it("should reject an unsuccessful API Worker delivery", async () => {
		inboundCallMock.mockResolvedValue(new Response(null, { status: 500 }));

		await expect(
			new NotpRepository().verifyMessages({
				apiWorker: {} as WebhooksWorkerEnv["API_WORKER"],
				messages: [message],
				telemetry: {
					environment: "staging",
					requestId: "webhooks-request-id",
					serviceVersion: "webhooks-worker-version",
				},
			}),
		).rejects.toThrow("API Worker rejected WhatsApp NOTP verification");
	});

	it("should log a correlated completed API inbound delivery", async () => {
		inboundCallMock.mockResolvedValue(
			new Response(null, {
				headers: { "x-request-id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
				status: 204,
			}),
		);

		await new NotpRepository().verifyMessages({
			apiWorker: {} as WebhooksWorkerEnv["API_WORKER"],
			messages: [message],
			telemetry: {
				environment: "staging",
				requestId: "webhooks-request-id",
				serviceVersion: "webhooks-worker-version",
			},
		});

		expect(console.log).toHaveBeenCalledWith({
			apiRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			attemptedDeliveryCount: 1,
			durationMilliseconds: expect.any(Number),
			env: "staging",
			event: "webhooks.api.inbound.delivery.completed",
			outcome: "SUCCESS",
			receiver: "verify-whatsapp-notp",
			rejectedDeliveryCount: 0,
			requestId: "webhooks-request-id",
			responseStatus: 204,
			service: "cataqui-webhooks-staging",
			version: "webhooks-worker-version",
		});
	});

	it.each([
		{ logMethod: "warn", responseStatus: 409 },
		{ logMethod: "error", responseStatus: 503 },
	] as const)("should log a bounded $responseStatus API inbound rejection", async ({ logMethod, responseStatus }) => {
		inboundCallMock
			.mockResolvedValueOnce(
				new Response(null, {
					headers: { "x-request-id": "not-a-valid-request-id" },
					status: 204,
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: responseStatus }));

		const error = await new NotpRepository()
			.verifyMessages({
				apiWorker: {} as WebhooksWorkerEnv["API_WORKER"],
				messages: [message, { ...message, providerMessageId: "second-provider-message-id" }],
				telemetry: {
					environment: "staging",
					requestId: "webhooks-request-id",
					serviceVersion: "webhooks-worker-version",
				},
			})
			.catch((caught: unknown) => caught);
		const log = logMethod === "warn" ? vi.mocked(console.warn) : vi.mocked(console.error);

		expect({ error: error, log: log.mock.calls[0]?.[0] }).toEqual({
			error: expect.objectContaining({ message: "API Worker rejected WhatsApp NOTP verification" }),
			log: {
				attemptedDeliveryCount: 2,
				durationMilliseconds: expect.any(Number),
				env: "staging",
				event: "webhooks.api.inbound.delivery.rejected",
				outcome: "REJECTED",
				receiver: "verify-whatsapp-notp",
				rejectedDeliveryCount: 1,
				requestId: "webhooks-request-id",
				responseStatus: responseStatus,
				service: "cataqui-webhooks-staging",
				version: "webhooks-worker-version",
			},
		});
	});
});
