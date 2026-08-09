import type { z } from "zod";
import { DeriveJobDataQueueMessageSchema } from "./schemas/derive-job-data-queue-message.schema";
import { InboundMessageAuthQueueMessageSchema } from "./schemas/inbound-message-auth-queue-message.schema";

export const queueControllerPath = "internal/queues" as const;

export const queueManifest = [
	{
		queueBaseName: "cataqui-api-derive-job-data",
		messageSchema: DeriveJobDataQueueMessageSchema,
	},
	{
		queueBaseName: "cataqui-api-verify-whatsapp-auth-message",
		messageSchema: InboundMessageAuthQueueMessageSchema,
	},
] as const satisfies readonly {
	queueBaseName: string;
	messageSchema: z.ZodType;
}[];

export type QueueName = (typeof queueManifest)[number]["queueBaseName"];

export function getQueueConsumerPath(params: { queueName: QueueName }): `internal/queues/${QueueName}` {
	return `${queueControllerPath}/${params.queueName}`;
}
