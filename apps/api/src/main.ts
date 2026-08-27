import { existsSync } from "node:fs";
import path from "node:path";
import { ObservabilityEventConstants } from "@cataqui/observability-contracts";
import {
	reportApplicationLifecycleFailure,
	shutdownTelemetry,
	startTelemetry,
} from "./core/observability/telemetry.js";

export const applicationStartupCompletion = Promise.resolve()
	.then(async () => {
		const localEnvironmentFilePath = path.resolve(process.cwd(), "../../.env");
		if (existsSync(localEnvironmentFilePath)) process.loadEnvFile(localEnvironmentFilePath);
		startTelemetry({ environment: process.env });
		const { bootstrap } = await import("./bootstrap.js");
		await bootstrap();
	})
	.catch(async (error: unknown) => {
		reportApplicationLifecycleFailure({
			environment: process.env["NODE_ENV"] ?? "unknown",
			error: error,
			event: ObservabilityEventConstants.API_APPLICATION_START_FAILED_EVENT,
		});
		try {
			await shutdownTelemetry();
		} catch (shutdownError: unknown) {
			reportApplicationLifecycleFailure({
				environment: process.env["NODE_ENV"] ?? "unknown",
				error: shutdownError,
				event: ObservabilityEventConstants.API_TELEMETRY_SHUTDOWN_FAILED_EVENT,
			});
		} finally {
			process.exitCode = 1;
		}
	});
