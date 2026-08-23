import type { z } from "zod";
import { DeriveJobDataInputSchema } from "./schemas/derive-job-data-input.schema.js";
import { VerifyInboundMessageAuthInputSchema } from "./schemas/verify-inbound-message-auth-input.schema.js";

export const apiContainerInboundManifest = {
	"derive-job-data": {
		bodySchema: DeriveJobDataInputSchema,
	},
	"verify-whatsapp-auth-message": {
		bodySchema: VerifyInboundMessageAuthInputSchema,
	},
} as const satisfies Record<string, { bodySchema: z.ZodType }>;

export const inboundReceiverPathPrefix = "internal/inbound" as const;

export type ApiContainerInboundReceiver = keyof typeof apiContainerInboundManifest;
export type ApiContainerInboundCall<Receiver extends ApiContainerInboundReceiver> = {
	receiver: Receiver;
	body: z.infer<(typeof apiContainerInboundManifest)[Receiver]["bodySchema"]>;
};
