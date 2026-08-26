import type { z } from "zod";
import { DeriveJobDataInputSchema } from "@cataqui/api-internal-ingress";
import type { ApiWorkerEnvironment } from "../../../../../../api-worker-environment";

export const apiContainerOutboundManifest = {
	"derive-job-data.queue": {
		bodySchema: DeriveJobDataInputSchema,
		execute: async (params: { body: z.output<typeof DeriveJobDataInputSchema>; environment: ApiWorkerEnvironment }) => {
			await params.environment.DERIVE_JOB_DATA_QUEUE.send(params.body);
		},
	},
} as const;

export type ApiContainerOutboundHost = keyof typeof apiContainerOutboundManifest;
