import { applyDecorators, Controller } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { queueControllerPath } from "../../platform/cloudflare/queues/queue.manifest";
import { SkipEnvelope } from "../../shared/decorators/skip-envelope.decorator";

export function QueueController(): ClassDecorator {
	return applyDecorators(Controller(queueControllerPath), ApiExcludeController(), SkipEnvelope());
}
