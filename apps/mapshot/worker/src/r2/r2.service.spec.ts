import type { R2ReadObjectByteRangeInput } from "@cataqui/mapshot-workerhole";
import * as td from "testdouble";
import { R2ObjectRevisionMismatchError } from "../errors/r2-object-revision-mismatch.error";
import type { R2Repository } from "./r2.repository";
import { R2Service } from "./r2.service";

afterEach(() => td.reset());

function _object(params: { body?: ReadableStream<Uint8Array> } = {}): R2ObjectBody {
	const bytes = new Uint8Array([1, 2, 3]);
	return {
		key: "objects/example.bin",
		version: "test",
		size: 1000,
		etag: "object-etag",
		httpEtag: '"object-etag"',
		checksums: { toJSON: () => ({}) },
		uploaded: new Date(0),
		storageClass: "Standard",
		range: { offset: 10, length: 3 },
		body: params.body ?? new Blob([bytes]).stream(),
		bodyUsed: false,
		writeHttpMetadata: () => undefined,
		arrayBuffer: async () => bytes.buffer,
		bytes: async () => bytes,
		text: async () => "",
		json: async <T>(): Promise<T> => {
			throw new Error("The range service must stream its body");
		},
		blob: async () => new Blob([bytes]),
	};
}

function _setup(): {
	repository: R2Repository;
	service: R2Service;
	controller: AbortController;
	input: R2ReadObjectByteRangeInput & { signal: AbortSignal };
} {
	const repository = td.object<R2Repository>();
	td.when(repository.readObjectByteRange(td.matchers.anything())).thenResolve(_object());
	const controller = new AbortController();
	return {
		repository: repository,
		service: new R2Service({ repository: repository }),
		controller: controller,
		input: {
			key: "objects/example.bin",
			etag: "object-etag",
			offset: 10,
			length: 3,
			signal: controller.signal,
		},
	};
}

describe("streamed R2 object byte ranges", () => {
	it("returns the provider stream directly without locking or wrapping it", async () => {
		const setup = _setup();
		const object = _object({ body: new ReadableStream<Uint8Array>() });
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenResolve(object);
		const result = await setup.service.readObjectByteRange(setup.input);
		expect(result).toBe(object.body);
		expect(object.body.locked).toBe(false);
		await result.cancel();
	});

	it("reports a missing provider object with its specific error code", async () => {
		const setup = _setup();
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenResolve(null);
		await expect(setup.service.readObjectByteRange(setup.input)).rejects.toMatchObject({
			name: "R2ObjectNotFoundError",
			errorCode: "R2_OBJECT_NOT_FOUND",
			message: "The requested R2 object was not found.",
		});
	});

	it("interprets a failed provider condition as a revision mismatch", async () => {
		const setup = _setup();
		const { body: _body, ...metadata } = _object();
		const object = { ...metadata, writeHttpMetadata: () => undefined } satisfies R2Object;
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenResolve(object);
		await expect(setup.service.readObjectByteRange(setup.input)).rejects.toMatchObject({
			name: "R2ObjectRevisionMismatchError",
			errorCode: "R2_OBJECT_REVISION_MISMATCH",
			message: "The R2 object's ETag does not match the requested revision.",
		});
	});

	it("discards an EOF-shortened range that cannot fulfill the requested byte count", async () => {
		const setup = _setup();
		const cancel = td.func<(reason: unknown) => void>();
		const source = _object({ body: new ReadableStream<Uint8Array>({ cancel: cancel }) });
		const object = {
			...source,
			writeHttpMetadata: source.writeHttpMetadata,
			range: { offset: 10, length: 2 },
		} satisfies R2ObjectBody;
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenResolve(object);
		await expect(setup.service.readObjectByteRange(setup.input)).rejects.toMatchObject({
			name: "R2ObjectRangeMismatchError",
			errorCode: "R2_OBJECT_RANGE_MISMATCH",
			message: "The R2 response range length is missing or does not match the requested byte count.",
		});
		td.verify(cancel(undefined), { times: 1 });
	});

	it.each([undefined, { offset: 10 }, { suffix: 3 }] satisfies (R2Range | undefined)[])(
		"rejects provider metadata without a usable byte count: %o",
		async (range) => {
			const setup = _setup();
			const source = _object();
			const { range: _range, ...metadata } = source;
			const object = {
				...metadata,
				writeHttpMetadata: source.writeHttpMetadata,
				...(range === undefined ? {} : { range: range }),
			} satisfies R2ObjectBody;
			td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenResolve(object);
			await expect(setup.service.readObjectByteRange(setup.input)).rejects.toMatchObject({
				name: "R2ObjectRangeMismatchError",
				errorCode: "R2_OBJECT_RANGE_MISMATCH",
				message: "The R2 response range length is missing or does not match the requested byte count.",
			});
		},
	);

	it("preserves the range failure when discarding its unusable body also fails", async () => {
		const setup = _setup();
		const cancel = td.func<(reason: unknown) => Promise<void>>();
		td.when(cancel(undefined)).thenReject(new Error("PRIVATE_CANCEL_FAILURE"));
		const source = _object({ body: new ReadableStream<Uint8Array>({ cancel: cancel }) });
		const object = {
			...source,
			writeHttpMetadata: source.writeHttpMetadata,
			range: { offset: 10, length: 2 },
		} satisfies R2ObjectBody;
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenResolve(object);
		await expect(setup.service.readObjectByteRange(setup.input)).rejects.toMatchObject({
			name: "R2ObjectRangeMismatchError",
			errorCode: "R2_OBJECT_RANGE_MISMATCH",
			message: "The R2 response range length is missing or does not match the requested byte count.",
		});
	});

	it.each(["synchronous", "asynchronous"])(
		"reports a provider failure (%s) with its specific read failure code",
		async (kind) => {
			const setup = _setup();
			const failure = new Error("PRIVATE_PROVIDER_FAILURE");
			if (kind === "synchronous")
				td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenDo((): never => {
					throw failure;
				});
			else td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenReject(failure);
			await expect(setup.service.readObjectByteRange(setup.input)).rejects.toMatchObject({
				name: "R2ObjectReadFailedError",
				errorCode: "R2_OBJECT_READ_FAILED",
				message: "The R2 provider failed to read the requested object byte range.",
			});
		},
	);

	it("preserves a known operation error", async () => {
		const setup = _setup();
		const failure = new R2ObjectRevisionMismatchError();
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenReject(failure);
		await expect(setup.service.readObjectByteRange(setup.input)).rejects.toBe(failure);
	});

	it("stops waiting for stalled metadata when the caller aborts", async () => {
		const setup = _setup();
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenReturn(new Promise(() => undefined));
		const reading = setup.service.readObjectByteRange(setup.input);
		setup.controller.abort();
		await expect(reading).rejects.toMatchObject({
			name: "R2ObjectReadAbortedError",
			errorCode: "R2_OBJECT_READ_ABORTED",
			message: "The R2 object byte range read was aborted.",
		});
		expect(td.explain(setup.repository.readObjectByteRange).calls[0]!.args[0].signal.aborted).toBe(true);
	});

	it("observes a late provider failure after the caller stops waiting", async () => {
		const setup = _setup();
		const pending = Promise.withResolvers<R2ObjectBody | R2Object | null>();
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenReturn(pending.promise);
		const reading = setup.service.readObjectByteRange(setup.input);
		setup.controller.abort();
		await expect(reading).rejects.toMatchObject({
			name: "R2ObjectReadAbortedError",
			errorCode: "R2_OBJECT_READ_ABORTED",
			message: "The R2 object byte range read was aborted.",
		});
		pending.reject(new Error("PRIVATE_LATE_STORAGE_FAILURE"));
	});

	it("forwards the supplied object key and ETag without a release lookup", async () => {
		const setup = _setup();
		const range = await setup.service.readObjectByteRange(setup.input);
		expect(td.explain(setup.repository.readObjectByteRange).calls.map((call) => call.args)).toEqual([[setup.input]]);
		await range.cancel();
	});

	it("starts independent streamed ranges without waiting for another consumer", async () => {
		const setup = _setup();
		const objects = Array.from({ length: 9 }, () => _object({ body: new ReadableStream<Uint8Array>() }));
		td.when(setup.repository.readObjectByteRange(td.matchers.anything())).thenResolve(objects[0]!, ...objects.slice(1));
		const readings = objects.map(() => setup.service.readObjectByteRange(setup.input));
		expect(td.explain(setup.repository.readObjectByteRange).callCount).toBe(objects.length);
		const outputs = await Promise.all(readings);
		await Promise.all(outputs.map((output) => output.cancel()));
	});

	it("already cancelled ranges never invoke the repository", async () => {
		const setup = _setup();
		setup.controller.abort();
		await expect(setup.service.readObjectByteRange(setup.input)).rejects.toMatchObject({
			name: "R2ObjectReadAbortedError",
			errorCode: "R2_OBJECT_READ_ABORTED",
			message: "The R2 object byte range read was aborted.",
		});
		expect(td.explain(setup.repository.readObjectByteRange).callCount).toBe(0);
	});
});
