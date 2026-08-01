import {
	type DeriveJobDataMessage,
	DeriveJobDataMessageSchema,
} from "../../queues/derive-job-data/derive-job-data-message.schema";
import { QueuePublisher } from "./queue-publisher";

function _parseMessage(requestBody: unknown): DeriveJobDataMessage | null {
	const result = DeriveJobDataMessageSchema.safeParse(requestBody);
	return result.success ? result.data : null;
}

async function publish(request: Request, env: Env): Promise<Response> {
	return QueuePublisher.publish({
		request: request,
		queue: env.DERIVE_JOB_DATA_QUEUE,
		parseMessage: _parseMessage,
	});
}

export const DeriveJobDataOutboundHandler = {
	publish,
} as const;
