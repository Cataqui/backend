import type { z } from "zod";
import { DeriveJobDataQueueMessageSchema } from "../../../queues/schemas/derive-job-data-queue-message.schema";
import type { ApiWorkerEnvironment } from "../../../workers/api/api-worker-environment";

export const apiContainerOutboundManifest = [
	{
		outboundHost: "derive-job-data.queue",
		bodySchema: DeriveJobDataQueueMessageSchema,
		execute: async (params: {
			body: z.output<typeof DeriveJobDataQueueMessageSchema>;
			environment: ApiWorkerEnvironment;
		}) => {
			await params.environment.DERIVE_JOB_DATA_QUEUE.send(params.body);
		},
	},
] as const;

export type ApiContainerOutboundHost = (typeof apiContainerOutboundManifest)[number]["outboundHost"];
