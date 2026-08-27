import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { metrics, trace } from "@opentelemetry/api";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import { readObservabilityConfig } from "./observability.config";
import { ObservabilityService } from "./observability.service";
import { reportApplicationLifecycleFailure, shutdownTelemetry } from "./telemetry";
import { createStructuredLogger, StructuredLogger } from "./structured-logger";

class ObservabilityLifecycle implements OnApplicationShutdown {
	async onApplicationShutdown(): Promise<void> {
		try {
			await shutdownTelemetry();
		} catch (error: unknown) {
			reportApplicationLifecycleFailure({
				environment: process.env["NODE_ENV"] ?? "unknown",
				error: error,
				event: ObservabilityEventConstants.API_TELEMETRY_SHUTDOWN_FAILED_EVENT,
			});
		}
	}
}

@Global()
@Module({
	providers: [
		{
			provide: ObservabilityService,
			useFactory: () => {
				const config = readObservabilityConfig({ environment: process.env });
				return new ObservabilityService({
					meter: metrics.getMeter(config.serviceName, config.serviceVersion),
					tracer: trace.getTracer(config.serviceName, config.serviceVersion),
				});
			},
		},
		{
			provide: StructuredLogger,
			useFactory: () => {
				const config = readObservabilityConfig({ environment: process.env });
				return createStructuredLogger({
					environment: config.environment,
					serviceVersion: config.serviceVersion,
				});
			},
		},
		ObservabilityLifecycle,
	],
	exports: [ObservabilityService, StructuredLogger],
})
export class ObservabilityModule {}
