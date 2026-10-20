import type { R2ReadObjectByteRangeInput } from "@cataqui/mapshot-workerhole";
import * as td from "testdouble";
import { R2Repository } from "./r2.repository";

afterEach(() => td.reset());

const _range = {
	key: "objects/example.bin",
	etag: "immutable-upload",
	offset: 10,
	length: 3,
} satisfies R2ReadObjectByteRangeInput;

function _object(params: { body?: ReadableStream<Uint8Array> } = {}): R2ObjectBody {
	const bytes = new Uint8Array([1, 2, 3]);
	return {
		key: _range.key,
		version: "test",
		size: 1000,
		etag: _range.etag,
		httpEtag: `"${_range.etag}"`,
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
			throw new Error("The range boundary must stream its body");
		},
		blob: async () => new Blob([bytes]),
	};
}

function _setup(): {
	object: R2ObjectBody;
	bucket: R2Bucket;
	controller: AbortController;
	repository: R2Repository;
	input: R2ReadObjectByteRangeInput & { signal: AbortSignal };
} {
	const object = _object();
	const bucket = td.object<R2Bucket>();
	td.when(bucket.get(td.matchers.anything(), td.matchers.anything())).thenResolve(object);
	const controller = new AbortController();
	return {
		object: object,
		bucket: bucket,
		controller: controller,
		repository: new R2Repository(bucket),
		input: { ..._range, signal: controller.signal },
	};
}

it("returns the raw conditional R2 range without reading or copying its body", async () => {
	const setup = _setup();
	const output = await setup.repository.readObjectByteRange(setup.input);
	expect(output).toBe(setup.object);
	expect(setup.object.body.locked).toBe(false);
	expect(td.explain(setup.bucket.get).calls.map((call) => call.args)).toEqual([
		[_range.key, { onlyIf: { etagMatches: _range.etag }, range: { offset: 10, length: 3 } }],
	]);
	await setup.object.body.cancel();
});

it.each(["synchronous", "asynchronous"])("preserves a %s R2 provider failure", async (kind) => {
	const setup = _setup();
	const failure = new Error("PRIVATE_PROVIDER_FAILURE");
	if (kind === "synchronous")
		td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenDo((): never => {
			throw failure;
		});
	else td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenReject(failure);
	await expect(setup.repository.readObjectByteRange(setup.input)).rejects.toBe(failure);
});

it("returns missing objects without interpreting the result", async () => {
	const setup = _setup();
	td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenResolve(null);
	await expect(setup.repository.readObjectByteRange(setup.input)).resolves.toBeNull();
});

it("returns failed conditions and shortened ranges without applying application requirements", async () => {
	const setup = _setup();
	const { body: _body, ...metadata } = setup.object;
	const failedCondition = { ...metadata, writeHttpMetadata: setup.object.writeHttpMetadata } satisfies R2Object;
	const shortenedRange = {
		...setup.object,
		writeHttpMetadata: setup.object.writeHttpMetadata,
		range: { offset: 10, length: 2 },
	} satisfies R2ObjectBody;
	for (const object of [failedCondition, shortenedRange]) {
		td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenResolve(object);
		await expect(setup.repository.readObjectByteRange(setup.input)).resolves.toBe(object);
	}
	await setup.object.body.cancel();
});

it("discards a late body when its caller aborts during the R2 read", async () => {
	const setup = _setup();
	const pending = Promise.withResolvers<R2ObjectBody>();
	td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenReturn(pending.promise);
	const cancel = td.func<(reason: unknown) => void>();
	const object = _object({ body: new ReadableStream<Uint8Array>({ cancel: cancel }) });
	const output = setup.repository.readObjectByteRange(setup.input);
	setup.controller.abort();
	pending.resolve(object);
	await expect(output).resolves.toBe(object);
	td.verify(cancel(undefined), { times: 1 });
});

it("returns late metadata without a body when the caller has aborted", async () => {
	const setup = _setup();
	const { body: _body, ...metadata } = setup.object;
	const object = { ...metadata, writeHttpMetadata: setup.object.writeHttpMetadata } satisfies R2Object;
	const pending = Promise.withResolvers<R2Object>();
	td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenReturn(pending.promise);
	const output = setup.repository.readObjectByteRange(setup.input);
	setup.controller.abort();
	pending.resolve(object);
	await expect(output).resolves.toBe(object);
});

it("preserves a late provider failure after cancellation", async () => {
	const setup = _setup();
	const pending = Promise.withResolvers<R2ObjectBody>();
	td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenReturn(pending.promise);
	const output = setup.repository.readObjectByteRange(setup.input);
	setup.controller.abort();
	const failure = new Error("PRIVATE_PROVIDER_FAILURE");
	pending.reject(failure);
	await expect(output).rejects.toBe(failure);
});

it("observes failures while discarding a late body", async () => {
	const setup = _setup();
	const pending = Promise.withResolvers<R2ObjectBody>();
	td.when(setup.bucket.get(td.matchers.anything(), td.matchers.anything())).thenReturn(pending.promise);
	const cancel = td.func<(reason: unknown) => Promise<void>>();
	td.when(cancel(undefined)).thenReject(new Error("PRIVATE_CANCEL_FAILURE"));
	const object = _object({ body: new ReadableStream<Uint8Array>({ cancel: cancel }) });
	const output = setup.repository.readObjectByteRange(setup.input);
	setup.controller.abort();
	pending.resolve(object);
	await expect(output).resolves.toBe(object);
});
