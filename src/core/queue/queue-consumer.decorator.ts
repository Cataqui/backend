import { applyDecorators, HttpCode, HttpStatus, Post, VERSION_NEUTRAL, Version } from "@nestjs/common";
import type { QueueName } from "../../platform/cloudflare/queues/queue.manifest";

export function QueueConsumer(queueName: QueueName): MethodDecorator {
	return applyDecorators(Post(queueName), Version(VERSION_NEUTRAL), HttpCode(HttpStatus.NO_CONTENT));
}
