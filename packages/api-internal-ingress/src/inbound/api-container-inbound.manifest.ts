import type { z } from "zod";
import { VerifyNotpInputSchema } from "./schemas/verify-notp-input.schema.js";

export const apiContainerInboundManifest = {
	"verify-whatsapp-notp": {
		bodySchema: VerifyNotpInputSchema,
	},
} as const satisfies Record<string, { bodySchema: z.ZodType }>;

export const inboundReceiverPathPrefix = "internal/inbound" as const;

export type ApiContainerInboundReceiver = keyof typeof apiContainerInboundManifest;
export type ApiContainerInboundCall<Receiver extends ApiContainerInboundReceiver> = {
	receiver: Receiver;
	body: z.infer<(typeof apiContainerInboundManifest)[Receiver]["bodySchema"]>;
};
