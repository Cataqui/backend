import { applyDecorators, HttpCode, HttpStatus, Post, VERSION_NEUTRAL, Version } from "@nestjs/common";
import {
	type ApiContainerInboundReceiver,
	inboundReceiverPathPrefix,
} from "../../platform/cloudflare/containers/api/inbound/api-container-inbound.manifest";

export function InboundReceiver(receiver: ApiContainerInboundReceiver): MethodDecorator {
	return applyDecorators(
		Post(`${inboundReceiverPathPrefix}/${receiver}`),
		Version(VERSION_NEUTRAL),
		HttpCode(HttpStatus.NO_CONTENT),
	);
}
