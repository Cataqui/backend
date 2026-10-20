import { SourceImportErrorCode } from "./source-import-error-code.enum";
import type { UnderlyingSource } from "node:stream/web";
import * as td from "testdouble";
import { type GetObjectCommandOutput, S3ServiceException } from "@aws-sdk/client-s3";
import type { R2ArchiveRangeRepository } from "./r2-archive-range.repository";
import { R2ArchiveRangeService } from "./r2-archive-range.service";
import { SourceImportError } from "./source-import.error";

const _key = "source/import/attempts/archive.pmtiles";

function _fixture(): { readRange: R2ArchiveRangeRepository["readRange"]; service: R2ArchiveRangeService } {
	const repository = td.object<R2ArchiveRangeRepository>();
	return { readRange: repository.readRange, service: new R2ArchiveRangeService({ repository: repository }) };
}
function _input(): Parameters<R2ArchiveRangeService["readRange"]>[0] {
	return { key: _key, offset: 0, length: 2, etag: "object-etag", signal: new AbortController().signal };
}

function _body(params: { chunks: Uint8Array[]; open?: boolean; cancelError?: boolean }): {
	body: NonNullable<GetObjectCommandOutput["Body"]>;
	cancel: NonNullable<UnderlyingSource<Uint8Array>["cancel"]>;
	stream: ReadableStream<Uint8Array>;
} {
	const cancel = td.func<NonNullable<UnderlyingSource<Uint8Array>["cancel"]>>();
	td.when(cancel(td.matchers.anything())).thenDo((): void => {
		if (params.cancelError) throw new Error("private cancellation error");
	});
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of params.chunks) controller.enqueue(chunk);
			if (!params.open) controller.close();
		},
		cancel: cancel,
	});
	const body: GetObjectCommandOutput["Body"] = Object.assign(stream, {
		transformToWebStream: () => stream,
		transformToByteArray: async () => new Uint8Array(),
		transformToString: async () => "",
	});
	return { body: body, cancel: cancel, stream: stream };
}

function _object(params?: { chunks?: Uint8Array[]; open?: boolean; cancelError?: boolean }): {
	body: ReturnType<typeof _body>;
	response: GetObjectCommandOutput;
} {
	const body = _body({
		chunks: params?.chunks ?? [new Uint8Array([1]), new Uint8Array([2])],
		...(params?.open === undefined ? {} : { open: params.open }),
		...(params?.cancelError === undefined ? {} : { cancelError: params.cancelError }),
	});
	return {
		body: body,
		response: {
			$metadata: {},
			ETag: '"object-etag"',
			ContentLength: 2,
			ContentRange: "bytes 0-1/100",
			Body: body.body,
		} satisfies GetObjectCommandOutput,
	};
}

function _providerError(params: { status?: number }): S3ServiceException {
	return new S3ServiceException({
		name: "ProviderFailure",
		message: "private credentials and provider diagnostics",
		$fault: "client",
		$metadata: params.status === undefined ? {} : { httpStatusCode: params.status },
	});
}

afterEach(() => td.reset());

describe("conditional archive range admission", () => {
	it.each(['"object-etag"', "object-etag"])("reads an exact range with strong ETag %s", async (etag) => {
		const { service, readRange } = _fixture();
		const { response } = _object();
		td.when(readRange(td.matchers.anything())).thenResolve({
			...response,
			ETag: etag,
			ContentRange: "bytes 4-5/100",
		});
		expect(await service.readRange({ ..._input(), offset: 4 })).toEqual(new Uint8Array([1, 2]));
		expect(td.explain(readRange).callCount).toBe(1);
		td.verify(
			readRange({ key: _key, etag: "object-etag", offset: 4, length: 2, signal: td.matchers.isA(AbortSignal) }),
		);
	});

	it.each([
		{ ETag: undefined },
		{ ETag: "different" },
		{ ETag: 'W/"object-etag"' },
		{ ETag: '"invalid' },
		{ ContentLength: undefined },
		{ ContentLength: 1 },
		{ ContentLength: 3 },
		{ ContentRange: undefined },
		{ ContentRange: "invalid" },
		{ ContentRange: "bytes 1-2/100" },
		{ ContentRange: "bytes 0-1/1" },
		{ ContentRange: "bytes 0-1/999999999999999999999" },
	])("cancels inconsistent range metadata before consuming bytes: %j", async (metadata) => {
		const { service, readRange } = _fixture();
		const { response, body } = _object({ open: true });
		td.when(readRange(td.matchers.anything())).thenResolve({ ...response, ...metadata });
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.INTEGRITY });
		expect(td.explain(readRange).callCount).toBe(1);
		expect(td.explain(body.cancel).callCount).toBe(1);
	});

	it.each([[], [new Uint8Array([1])], [new Uint8Array([1, 2, 3])]])(
		"rejects a body with an incorrect byte count: %j",
		async (...chunks) => {
			const { service, readRange } = _fixture();
			td.when(readRange(td.matchers.anything())).thenResolve(_object({ chunks: chunks }).response);
			await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.INTEGRITY });
			expect(td.explain(readRange).callCount).toBe(1);
		},
	);

	it("cancels an oversized response immediately without collecting the remaining body", async () => {
		const { service, readRange } = _fixture();
		const { response, body } = _object({ chunks: [new Uint8Array([1, 2, 3])], open: true });
		td.when(readRange(td.matchers.anything())).thenResolve(response);
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.INTEGRITY });
		expect(td.explain(body.cancel).callCount).toBe(1);
	});

	it("keeps integrity failure when body cancellation rejects", async () => {
		const { service, readRange } = _fixture();
		const { response, body } = _object({ chunks: [new Uint8Array([1, 2, 3])], open: true, cancelError: true });
		td.when(readRange(td.matchers.anything())).thenResolve(response);
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.INTEGRITY });
		expect(td.explain(body.cancel).callCount).toBe(1);
	});

	it("keeps integrity failure when mismatched-body conversion throws", async () => {
		const { service, readRange } = _fixture();
		const { response, body } = _object();
		td.when(td.replace(body.body, "transformToWebStream")()).thenDo((): ReadableStream<Uint8Array> => {
			throw new Error("private stream error");
		});
		td.when(readRange(td.matchers.anything())).thenResolve({ ...response, ETag: "different" });
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.INTEGRITY });
	});
});

describe("bounded archive transport and retries", () => {
	it.each([_providerError({ status: 500 }), _providerError({ status: 404 }), _providerError({}), new Error("private")])(
		"sanitizes and retries a storage failure once",
		async (failure) => {
			const { service, readRange } = _fixture();
			td.when(readRange(td.matchers.anything())).thenReject(failure);
			await expect(service.readRange(_input())).rejects.toMatchObject({
				code: SourceImportErrorCode.STORAGE,
				message: "Mapshot source import failed: STORAGE.",
			});
			expect(td.explain(readRange).callCount).toBe(2);
		},
	);

	it.each([409, 412])("maps conditional HTTP %i to conflict and retries once", async (status) => {
		const { service, readRange } = _fixture();
		td.when(readRange(td.matchers.anything())).thenReject(_providerError({ status: status }));
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.CONFLICT });
		expect(td.explain(readRange).callCount).toBe(2);
	});

	it("returns bytes when the one retry succeeds", async () => {
		const { service, readRange } = _fixture();
		let attempt = 0;
		td.when(readRange(td.matchers.anything())).thenDo(async (): Promise<GetObjectCommandOutput> => {
			if (attempt++ === 0) throw new SourceImportError({ code: SourceImportErrorCode.STORAGE });
			return _object().response;
		});
		expect(await service.readRange(_input())).toEqual(new Uint8Array([1, 2]));
		expect(td.explain(readRange).callCount).toBe(2);
	});

	it.each([SourceImportErrorCode.INTEGRITY, SourceImportErrorCode.ABORTED])(
		"does not retry an owned %s failure",
		async (code) => {
			const { service, readRange } = _fixture();
			td.when(readRange(td.matchers.anything())).thenReject(new SourceImportError({ code: code }));
			await expect(service.readRange(_input())).rejects.toMatchObject({ code: code });
			expect(td.explain(readRange).callCount).toBe(1);
		},
	);

	it("treats a missing body as storage failure and retries once", async () => {
		const { service, readRange } = _fixture();
		td.when(readRange(td.matchers.anything())).thenResolve({
			$metadata: {},
			ETag: "object-etag",
			ContentLength: 2,
			ContentRange: "bytes 0-1/2",
		});
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.STORAGE });
		expect(td.explain(readRange).callCount).toBe(2);
	});

	it("sanitizes stream conversion failures and retries once", async () => {
		const { service, readRange } = _fixture();
		const { response, body } = _object();
		td.when(td.replace(body.body, "transformToWebStream")()).thenDo((): ReadableStream<Uint8Array> => {
			throw new Error("private conversion failure");
		});
		td.when(readRange(td.matchers.anything())).thenResolve(response);
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.STORAGE });
		expect(td.explain(readRange).callCount).toBe(2);
	});

	it("sanitizes a failing body read and retries once", async () => {
		const { service, readRange } = _fixture();
		td.when(readRange(td.matchers.anything())).thenDo(async (): Promise<GetObjectCommandOutput> => {
			const { response, body } = _object();
			td.when(td.replace(body.body, "transformToWebStream")()).thenReturn(
				new ReadableStream({
					start(controller) {
						controller.error(new Error("private read failure"));
					},
				}),
			);
			return response;
		});
		await expect(service.readRange(_input())).rejects.toMatchObject({ code: SourceImportErrorCode.STORAGE });
		expect(td.explain(readRange).callCount).toBe(2);
	});

	it("does not send when the caller is already aborted", async () => {
		const { service, readRange } = _fixture();
		await expect(service.readRange({ ..._input(), signal: AbortSignal.abort() })).rejects.toMatchObject({
			code: SourceImportErrorCode.ABORTED,
		});
		expect(td.explain(readRange).callCount).toBe(0);
	});

	it("interrupts an unresponsive SDK request when the caller aborts", async () => {
		const { service, readRange } = _fixture();
		const controller = new AbortController();
		td.when(readRange(td.matchers.anything())).thenDo(
			(): Promise<GetObjectCommandOutput> => new Promise(() => undefined),
		);
		const result = service.readRange({ ..._input(), signal: controller.signal });
		controller.abort();
		await expect(result).rejects.toMatchObject({ code: SourceImportErrorCode.ABORTED });
		expect(td.explain(readRange).callCount).toBe(1);
	});

	it("uses the caller deadline throughout the range request", async () => {
		const { service, readRange } = _fixture();
		const timeout = new AbortController();
		const deadline = td.replace(AbortSignal, "timeout");
		td.when(readRange(td.matchers.anything())).thenDo(
			(): Promise<GetObjectCommandOutput> => new Promise(() => undefined),
		);
		const input = { ..._input(), signal: timeout.signal };
		const result = service.readRange(input);
		td.verify(deadline(td.matchers.anything()), { times: 0 });
		td.verify(readRange(input));
		timeout.abort();
		await expect(result).rejects.toMatchObject({ code: SourceImportErrorCode.ABORTED });
		expect(td.explain(readRange).callCount).toBe(1);
	});

	it("cancels a pending range body when the caller aborts", async () => {
		const { service, readRange } = _fixture();
		const controller = new AbortController();
		const { response, body } = _object({ chunks: [], open: true });
		td.when(readRange(td.matchers.anything())).thenResolve(response);
		const result = service.readRange({ ..._input(), signal: controller.signal });
		await vi.waitFor(() => expect(body.stream.locked).toBe(true));
		controller.abort();
		await expect(result).rejects.toMatchObject({ code: SourceImportErrorCode.ABORTED });
		expect(td.explain(body.cancel).callCount).toBe(1);
		expect(td.explain(readRange).callCount).toBe(1);
	});

	it("maps a transport failure simultaneous with cancellation to aborted", async () => {
		const { service, readRange } = _fixture();
		const controller = new AbortController();
		td.when(readRange(td.matchers.anything())).thenDo(async (): Promise<GetObjectCommandOutput> => {
			controller.abort();
			throw new Error("private");
		});
		await expect(service.readRange({ ..._input(), signal: controller.signal })).rejects.toMatchObject({
			code: SourceImportErrorCode.ABORTED,
		});
		expect(td.explain(readRange).callCount).toBe(1);
	});
});
