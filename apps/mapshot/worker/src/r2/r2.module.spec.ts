import * as td from "testdouble";
import { createR2Service } from "./r2.module";

afterEach(() => td.reset());

function _bucket(bytes: Uint8Array): R2Bucket {
	const bucket = td.object<R2Bucket>();
	const object: R2ObjectBody = {
		key: "objects/example.bin",
		version: "v1",
		size: 1000,
		etag: "immutable-upload",
		httpEtag: '"immutable-upload"',
		checksums: { toJSON: () => ({}) },
		uploaded: new Date(0),
		storageClass: "Standard",
		range: { offset: 100, length: bytes.byteLength },
		body: new Blob([Uint8Array.from(bytes)]).stream(),
		bodyUsed: false,
		writeHttpMetadata: () => undefined,
		arrayBuffer: async () => Uint8Array.from(bytes).buffer,
		bytes: async () => Uint8Array.from(bytes),
		text: async () => "",
		json: async <T>(): Promise<T> => {
			throw new Error("Range reads must stream their provider body");
		},
		blob: async () => new Blob([Uint8Array.from(bytes)]),
	};
	td.when(bucket.get(td.matchers.anything(), td.matchers.anything())).thenResolve(object);
	return bucket;
}

it("streams each requested range through the current R2 binding without retaining a previous request owner", async () => {
	const original = _bucket(Uint8Array.of(1, 2, 3));
	const replacement = _bucket(Uint8Array.of(4, 5, 6));
	const input = {
		key: "objects/example.bin",
		etag: "immutable-upload",
		offset: 100,
		length: 3,
		signal: new AbortController().signal,
	};
	const first = await createR2Service({ bucket: original }).readObjectByteRange(input);
	expect(await new Response(first).bytes()).toEqual(Uint8Array.of(1, 2, 3));
	const next = await createR2Service({ bucket: replacement }).readObjectByteRange(input);
	expect(await new Response(next).bytes()).toEqual(Uint8Array.of(4, 5, 6));
	for (const bucket of [original, replacement])
		expect(td.explain(bucket.get).calls.map((call) => call.args)).toEqual([
			["objects/example.bin", { onlyIf: { etagMatches: "immutable-upload" }, range: { offset: 100, length: 3 } }],
		]);
});
