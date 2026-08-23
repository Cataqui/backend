import type { z } from "zod";
import { inboundCall, type VerifyInboundMessageAuthInputSchema } from "@cataqui/api-internal-ingress";

export class InboundMessageAuthRepository {
	async verifyMessages(params: {
		apiWorker: WebhooksWorkerEnv["API_WORKER"];
		messages: z.infer<typeof VerifyInboundMessageAuthInputSchema>[];
	}): Promise<void> {
		const responses = await Promise.all(
			params.messages.map((message) =>
				inboundCall({
					worker: params.apiWorker,
					receiver: "verify-whatsapp-auth-message",
					body: message,
				}),
			),
		);

		if (responses.some((response) => !response.ok)) {
			throw new Error("API Worker rejected WhatsApp authentication");
		}
	}
}
