import type { MapshotWorkerEnv } from "../cloudflare.config.ts";
import * as td from "testdouble";
import type { R2Service } from "./r2/r2.service";
import { createR2Service } from "./r2/r2.module";
import { MapshotWorkerPortal } from "./worker-portal";

vi.mock("./r2/r2.module", async () => {
	const td = await import("testdouble");
	return { createR2Service: td.func<typeof import("./r2/r2.module").createR2Service>() };
});
let _service: R2Service;
afterEach(() => td.reset());
beforeEach(() => {
	_service = td.object<R2Service>();
	td.when(createR2Service(td.matchers.anything())).thenReturn(_service);
});
function _portal(): { portal: MapshotWorkerPortal; bucket: R2Bucket } {
	const bucket = td.object<R2Bucket>();
	const environment = td.object<MapshotWorkerEnv>();
	environment.R2 = bucket;
	const portal = new MapshotWorkerPortal(td.object<ExecutionContext>(), environment);
	return { portal: portal, bucket: bucket };
}
it("forwards range reads and cancellation to their owning service", async () => {
	const state = _portal();
	const output = new ReadableStream<Uint8Array>();
	td.when(_service.readObjectByteRange(td.matchers.anything())).thenResolve(output);
	const signal = new AbortController().signal;
	expect(
		await state.portal.expose.readObjectByteRange(
			{ key: "source/slots/a/planet.pmtiles", etag: "etag", offset: 1, length: 3 },
			{ signal: signal },
		),
	).toBe(output);
	const factories = td.explain(createR2Service).calls;
	expect(factories).toHaveLength(1);
	expect(Object.keys(factories[0]!.args[0])).toEqual(["bucket"]);
	expect(factories[0]!.args[0].bucket).toBe(state.bucket);
	expect(td.explain(_service.readObjectByteRange).calls.map((call) => call.args)).toEqual([
		[
			{
				key: "source/slots/a/planet.pmtiles",
				etag: "etag",
				offset: 1,
				length: 3,
				signal: signal,
			},
		],
	]);
});
