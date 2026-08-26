import { applyDecorators, Controller } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipEnvelope } from "../../shared/decorators/skip-envelope.decorator";

export function InboundController(): ClassDecorator {
	return applyDecorators(Controller(), ApiExcludeController(), SkipEnvelope());
}
