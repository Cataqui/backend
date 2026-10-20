import { Controller, Get, Inject, VERSION_NEUTRAL, Version } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { runtimeConfig, type RuntimeConfig } from "./core/config/runtime.config";
import { SkipEnvelope } from "./shared/decorators/skip-envelope.decorator";

@ApiTags("app")
@Controller()
export class AppController {
	constructor(@Inject(runtimeConfig.KEY) private readonly _runtimeConfig: RuntimeConfig) {}

	@Get()
	@Version(VERSION_NEUTRAL)
	@SkipEnvelope()
	@ApiOperation({ summary: "Root endpoint — server status" })
	@ApiResponse({
		status: 200,
		description: "Returns server status and environment info",
	})
	root(): { status: string; message: string; environment: RuntimeConfig["environment"] } {
		return {
			status: "ok",
			message: "Cataquí API server is running...",
			environment: this._runtimeConfig.environment,
		};
	}
}
