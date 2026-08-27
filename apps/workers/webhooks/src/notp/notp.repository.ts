import type { z } from "zod";
import {
	type ApiContainerInboundReceiver,
	inboundCall,
	type VerifyNotpInputSchema,
} from "@cataqui/api-internal-ingress";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import type { NotpDeliveryTelemetry } from "./notp-delivery-telemetry";

export class NotpRepository {
	async verifyMessages(params: {
		apiWorker: WebhooksWorkerEnv["API_WORKER"];
		messages: [z.infer<typeof VerifyNotpInputSchema>, ...z.infer<typeof VerifyNotpInputSchema>[]];
		telemetry: NotpDeliveryTelemetry;
	}): Promise<void> {
		const deliveryStartedAt = performance.now();
		const inboundReceiver = "verify-whatsapp-notp" satisfies ApiContainerInboundReceiver;
		const responses = await Promise.all(
			params.messages.map((message) =>
				inboundCall({
					worker: params.apiWorker,
					receiver: inboundReceiver,
					body: message,
				}),
			),
		);

		const rejectedDeliveryCount = responses.filter((response) => !response.ok).length;
		const responseStatus = Math.max(...responses.map((response) => response.status));
		const apiRequestIdCandidate = responses.length === 1 ? responses[0]?.headers.get("x-request-id") : null;
		const apiRequestId =
			typeof apiRequestIdCandidate === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(apiRequestIdCandidate)
				? apiRequestIdCandidate
				: null;
		const deliveryLogFields = {
			...(apiRequestId === null ? {} : { apiRequestId: apiRequestId }),
			attemptedDeliveryCount: params.messages.length,
			durationMilliseconds: performance.now() - deliveryStartedAt,
			env: params.telemetry.environment,
			receiver: inboundReceiver,
			requestId: params.telemetry.requestId,
			responseStatus: responseStatus,
			service: `cataqui-webhooks-${params.telemetry.environment}`,
			version: params.telemetry.serviceVersion,
		};

		if (rejectedDeliveryCount > 0) {
			const log = responseStatus >= 500 ? console.error : console.warn;
			log({
				...deliveryLogFields,
				event: ObservabilityEventConstants.WEBHOOKS_API_INBOUND_DELIVERY_REJECTED_EVENT,
				outcome: "REJECTED",
				rejectedDeliveryCount: rejectedDeliveryCount,
			});
			throw new Error("API Worker rejected WhatsApp NOTP verification");
		}

		console.log({
			...deliveryLogFields,
			event: ObservabilityEventConstants.WEBHOOKS_API_INBOUND_DELIVERY_COMPLETED_EVENT,
			outcome: "SUCCESS",
			rejectedDeliveryCount: 0,
		});
	}
}
