import type { OutboundHandler } from "@cloudflare/containers";
import { DeriveJobDataQueueConstants } from "../../queues/derive-job-data/derive-job-data-queue.constants";
import { DeriveJobDataOutboundHandler } from "./derive-job-data.outbound-handler";

export const OutboundHandlers = {
	[DeriveJobDataQueueConstants.OUTBOUND_HOST]: DeriveJobDataOutboundHandler.publish,
} satisfies Record<string, OutboundHandler<Env>>;
