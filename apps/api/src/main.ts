import { recordFatalError, startTelemetry } from "./core/observability/telemetry";

// Telemetry must start before bootstrap imports NestJS, Fastify, and Prisma so their instrumentation can attach.
startTelemetry();

void import("./bootstrap.js")
	.then(({ bootstrap }) => bootstrap())
	.catch(async (error: unknown) => {
		const errorName = error instanceof Error ? error.name : "UnknownError";
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;

		process.stderr.write(
			`${JSON.stringify({
				event: "api.application.start.failed",
				level: "fatal",
				timestamp: new Date().toISOString(),
				environment: process.env["NODE_ENV"] ?? "unknown",
				errorName: errorName,
				errorMessage: errorMessage,
				...(errorStack === undefined ? {} : { errorStack: errorStack }),
			})}\n`,
		);
		process.exitCode = 1;
		await recordFatalError({ event: "api.application.start.failed", error: error });
	});
