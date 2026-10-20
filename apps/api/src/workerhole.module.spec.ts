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

it("provides the typed Worker client during Nest construction and closes it on shutdown", async () => {
	_module = await Test.createTestingModule({ imports: [WorkerholeModule] }).compile();
	expect(_module.get(ApiWorkerPortal)).toBe(_worker);
	const registration: ConnectToWorkerOptions = td.explain(_workerhole.connect).calls[0]?.args[1];
	expect(td.explain(_workerhole.connect).calls[0]?.args[0]).toBe(ApiWorkerPortal);
	expect(registration).not.toHaveProperty("server");
	expect(registration.expose).toEqual({ expose: {} });
	await _module.close();
	_module = undefined;
	td.verify(_worker.close(), { times: 1 });
});

it("fails Nest construction when the private portal listener cannot start", async () => {
	const failure = new Error("portal port occupied");
	td.when(_workerhole.connect(td.matchers.anything(), td.matchers.anything())).thenReject(failure);
	await expect(Test.createTestingModule({ imports: [WorkerholeModule] }).compile()).rejects.toBe(failure);
});
