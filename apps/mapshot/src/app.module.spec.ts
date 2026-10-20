import { AppErrorCode } from "./errors/index";
import { expect, it } from "vitest";
import { createMapshotApplication } from "./app.module";
import { MapshotApplication } from "./application";

import { MapshotWorkerContainerPortal } from "./worker-container-portal";

it("resolves the application graph without starting I/O and registers its RPC workerContainerPortal", async () => {
	const module = createMapshotApplication();
	expect(module.application).toBeInstanceOf(MapshotApplication);
	expect(module.workerContainerPortal).toBeInstanceOf(MapshotWorkerContainerPortal);
	expect(module.application.ready).toBe(false);
	expect(module.application.indexes).toBeUndefined();
	await expect(
		module.workerContainerPortal.expose.render(
			{ center: { latitude: -23.55, longitude: -46.63 }, zoom: 13, size: { width: 480, height: 480 } },
			{ signal: new AbortController().signal },
		),
	).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_READY });
	await module.application.close();
});

it("isolates application instances and their shutdown signals in separate DI scopes", async () => {
	const first = createMapshotApplication();
	const second = createMapshotApplication();
	expect(first.workerContainerPortal).not.toBe(second.workerContainerPortal);
	await first.application.close();
	expect(first.application.signal.aborted).toBe(true);
	expect(second.application.signal.aborted).toBe(false);
	await second.application.close();
});
