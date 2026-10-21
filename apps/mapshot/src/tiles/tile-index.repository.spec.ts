import * as td from "testdouble";
import { afterEach, describe, expect, it } from "vitest";
import type { MapshotWorkerPortal } from "@cataqui/mapshot-workerhole";
import { TileIndexRepository } from "./tile-index.repository";

afterEach(() => td.reset());

function _fixture(): {
	client: MapshotWorkerPortal;
	worker: MapshotWorkerPortal;
	repository: TileIndexRepository;
} {
	const client = td.object<MapshotWorkerPortal>();
	const worker = td.object<MapshotWorkerPortal>();
	td.when(worker.withOptions(td.matchers.anything())).thenReturn(client);
	return { client: client, worker: worker, repository: new TileIndexRepository({ worker: worker }) };
}

describe("TileIndexRepository", () => {
	it("forwards the requested object range and supplied cancellation signal", async () => {
		const fixture = _fixture();
		const signal = new AbortController().signal;
		const result = new Response(Uint8Array.of(1, 2, 3)).body! satisfies Awaited<
			ReturnType<MapshotWorkerPortal["readObjectByteRange"]>
		>;
		td.when(fixture.client.readObjectByteRange({ key: "archive", etag: "revision", offset: 5, length: 3 })).thenResolve(
			result,
		);
		expect(
			await fixture.repository.readObjectByteRange({
				key: "archive",
				etag: "revision",
				offset: 5,
				length: 3,
				signal: signal,
			}),
		).toBe(result);
		expect(td.explain(fixture.worker.withOptions).callCount).toBe(1);
		expect(td.explain(fixture.worker.withOptions).calls[0]?.args[0]?.signal).toBe(signal);
		expect(td.explain(fixture.worker.readObjectByteRange).callCount).toBe(0);
	});

	it("lets a Worker read failure reach the calling service unchanged", async () => {
		const fixture = _fixture();
		const failure = new Error("Worker read failed");
		td.when(fixture.client.readObjectByteRange(td.matchers.anything())).thenReject(failure);
		await expect(
			fixture.repository.readObjectByteRange({
				key: "archive",
				etag: "revision",
				offset: 5,
				length: 3,
				signal: new AbortController().signal,
			}),
		).rejects.toBe(failure);
	});
});
