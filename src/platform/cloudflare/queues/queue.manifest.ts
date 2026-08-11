import type { ApiContainerInboundReceiver } from "../containers/api/inbound/api-container-inbound.manifest";

export const queueManifest = {
	"cataqui-api-derive-job-data": {
		inboundReceiver: "derive-job-data",
	},
} as const satisfies Record<string, { inboundReceiver: ApiContainerInboundReceiver }>;

export type QueueName = keyof typeof queueManifest;
