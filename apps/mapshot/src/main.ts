import { ContainerConfig, MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import { connectContainerToWorker } from "@cataqui/workerhole";
import "reflect-metadata";
import { serve } from "srvx/node";
import { createMapshotApplication } from "./app.module";
import { createHealthHandler } from "./health/health.controller";

const { application, workerContainerPortal } = createMapshotApplication();

const host = serve({
	port: ContainerConfig.port,
	hostname: "0.0.0.0",
	manual: true,
	gracefulShutdown: false,
	node: { maxHeaderSize: 8192, requestTimeout: 45_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 },
	fetch: createHealthHandler({
		ready: () => application.ready,
		indexes: () => application.indexes,
	}),
});

const worker = await connectContainerToWorker(MapshotWorkerPortal, {
	expose: workerContainerPortal,
});

const listening = Promise.resolve(host.serve());

void listening
	.then(async (): Promise<void> => {
		if (application.signal.aborted) return;
		await application.initialize({ worker: worker });
	})
	.catch(() => {
		console.warn({ event: "mapshot.renderer.initialization-failed" });
		const failedToListen = host.node?.server?.listening !== true && !application.signal.aborted;
		if (failedToListen) process.exitCode = 1;
	});

function _stop(): void {
	if (application.signal.aborted) return;
	void application.close().catch(() => console.warn({ event: "mapshot.renderer.shutdown-failed" }));

	void worker.close().catch(() => console.warn({ event: "mapshot.workerhole.shutdown-failed" }));
	void listening
		.then(
			() => host.close(true),
			() => undefined,
		)
		.catch(() => console.warn({ event: "mapshot.http.shutdown-failed" }));
}

process.once("SIGTERM", _stop);
process.once("SIGINT", _stop);
