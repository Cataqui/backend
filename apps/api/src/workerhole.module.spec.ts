import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import type { ConnectToWorkerOptions } from "@cataqui/workerhole";
import { Test, type TestingModule } from "@nestjs/testing";
import * as td from "testdouble";
import { WorkerholeModule } from "./workerhole.module";

const _workerhole = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return { connect: td.func<typeof import("@cataqui/workerhole").connectContainerToWorker>() };
});
vi.mock("@cataqui/workerhole", async (original) => ({
	...(await original<typeof import("@cataqui/workerhole")>()),
	connectContainerToWorker: _workerhole.connect,
}));

let _module: TestingModule | undefined;
let _worker: ApiWorkerPortal;
afterEach(() => td.reset());
afterEach(async () => {
	await _module?.close();
});
beforeEach(() => {
	_module = undefined;
	_worker = td.object<ApiWorkerPortal>();
	td.when(_worker.close()).thenResolve(undefined);
	td.when(_workerhole.connect(td.matchers.anything(), td.matchers.anything())).thenResolve(_worker);
});

it("provides only the declared Worker client methods during Nest construction", async () => {
	_module = await Test.createTestingModule({ imports: [WorkerholeModule] }).compile();
	const client = _module.get<ApiWorkerPortal>(ApiWorkerPortal);
	const registration: ConnectToWorkerOptions = td.explain(_workerhole.connect).calls[0]?.args[1];
	await _module.close();
	_module = undefined;
	expect({
		client: client,
		definition: td.explain(_workerhole.connect).calls[0]?.args[0],
		registration: registration,
	}).toEqual({
		client: {
			getStaticMapLocationUrl: _worker.getStaticMapLocationUrl,
			withOptions: _worker.withOptions,
			close: _worker.close,
		},
		definition: ApiWorkerPortal,
		registration: { expose: { expose: {} } },
	});
});

it("fails Nest construction when the private portal listener cannot start", async () => {
	const failure = new Error("portal port occupied");
	td.when(_workerhole.connect(td.matchers.anything(), td.matchers.anything())).thenReject(failure);
	await expect(Test.createTestingModule({ imports: [WorkerholeModule] }).compile()).rejects.toBe(failure);
});

it("initializes and shuts down Nest without dispatching lifecycle hooks through the Worker portal", async () => {
	const unknownRemoteCall = td.func<() => Promise<never>>();
	td.when(unknownRemoteCall()).thenReject(new Error("Nest lifecycle hook was dispatched as RPC"));
	const worker = new Proxy(_worker, {
		get(target, property): unknown {
			if (property === "then") return undefined;
			if (property === "close" || property === "withOptions" || property === "getStaticMapLocationUrl")
				return Reflect.get(target, property);
			return unknownRemoteCall;
		},
	});
	td.when(_workerhole.connect(td.matchers.anything(), td.matchers.anything())).thenResolve(worker);
	_module = await Test.createTestingModule({ imports: [WorkerholeModule] }).compile();
	await _module.init();
	await _module.close();
	_module = undefined;
	td.verify(_worker.close(), { times: 1 });
});
