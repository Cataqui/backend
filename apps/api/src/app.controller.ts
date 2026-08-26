import { Controller, Get, VERSION_NEUTRAL, Version } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipEnvelope } from "./shared/decorators/skip-envelope.decorator";

@ApiTags("app")
@Controller()
export class AppController {
	@Get()
	@Version(VERSION_NEUTRAL)
	@SkipEnvelope()
	@ApiOperation({ summary: "Root endpoint — server status" })
	@ApiResponse({
		status: 200,
		description: "Returns server status and environment info",
	})
	root() {
		return {
			status: "ok",
			message: "Cataquí API server is running...",
			environment: process.env["NODE_ENV"] ?? "development",
		};
	}
}
