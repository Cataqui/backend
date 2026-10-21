import * as td from "testdouble";
import { GetObjectCommand, type GetObjectCommandOutput, type S3Client } from "@aws-sdk/client-s3";
import { R2ArchiveRangeRepository } from "./r2-archive-range.repository";

function _fixture(): { send: S3Client["send"]; repository: R2ArchiveRangeRepository } {
	const client = td.object<S3Client>();
	return {
		send: client.send,
		repository: new R2ArchiveRangeRepository({ bucket: "private-map-data", client: client }),
	};
}

function _input(): Parameters<R2ArchiveRangeRepository["readRange"]>[0] {
	return {
		key: "source/import/attempts/archive.pmtiles",
		offset: 4,
		length: 2,
		etag: "object-etag",
		signal: new AbortController().signal,
	};
}

function _body(): {
	body: NonNullable<GetObjectCommandOutput["Body"]>;
	cancel: (reason?: unknown) => void;
} {
	const cancel = td.func<(reason?: unknown) => void>();
	const stream = new ReadableStream<Uint8Array>({ cancel: cancel });
	return {
		body: Object.assign(stream, {
			transformToWebStream: (): ReadableStream<Uint8Array> => stream,
			transformToByteArray: async (): Promise<Uint8Array> => new Uint8Array(),
			transformToString: async (): Promise<string> => "",
		}),
		cancel: cancel,
	};
}

afterEach(() => td.reset());

describe("R2 archive range I/O", () => {
	it("returns the raw provider response with a conditional byte-range request", async () => {
		const { repository, send } = _fixture();
		const response = { $metadata: {}, ETag: "provider-etag" } satisfies GetObjectCommandOutput;
		const input = _input();
		td.when(send(td.matchers.anything(), td.matchers.anything())).thenResolve(response);
		expect(await repository.readRange(input)).toBe(response);
		const [command, options] = td.explain(send).calls[0]?.args ?? [];
		expect(command).toBeInstanceOf(GetObjectCommand);
		expect(command.input).toEqual({
			Bucket: "private-map-data",
			Key: input.key,
			Range: "bytes=4-5",
			IfMatch: '"object-etag"',
		});
		expect(options).toEqual({ abortSignal: input.signal });
		expect(td.explain(send).callCount).toBe(1);
	});

	it("preserves the provider failure without retry or application-error translation", async () => {
		const { repository, send } = _fixture();
		const failure = new Error("raw provider failure");
		td.when(send(td.matchers.anything(), td.matchers.anything())).thenReject(failure);
		await expect(repository.readRange(_input())).rejects.toBe(failure);
		expect(td.explain(send).callCount).toBe(1);
	});

	it("discards a late body when the supplied signal has aborted", async () => {
		const { repository, send } = _fixture();
		const controller = new AbortController();
		const pending = Promise.withResolvers<GetObjectCommandOutput>();
		const { body, cancel } = _body();
		td.when(send(td.matchers.anything(), td.matchers.anything())).thenReturn(pending.promise);
		const result = repository.readRange({ ..._input(), signal: controller.signal });
		const reason = new Error("caller cancelled");
		controller.abort(reason);
		pending.resolve({ $metadata: {}, Body: body });
		await expect(result).rejects.toBe(reason);
		td.verify(cancel(undefined));
	});

	it("preserves cancellation when the late body cleanup rejects", async () => {
		const { repository, send } = _fixture();
		const { body, cancel } = _body();
		td.when(cancel(td.matchers.anything())).thenDo((): never => {
			throw new Error("cleanup failure");
		});
		td.when(send(td.matchers.anything(), td.matchers.anything())).thenResolve({ $metadata: {}, Body: body });
		const signal = AbortSignal.abort();
		await expect(repository.readRange({ ..._input(), signal: signal })).rejects.toBe(signal.reason);
	});

	it("preserves cancellation when the late body cannot be converted", async () => {
		const { repository, send } = _fixture();
		const { body } = _body();
		td.when(td.replace(body, "transformToWebStream")()).thenDo((): never => {
			throw new Error("conversion failure");
		});
		td.when(send(td.matchers.anything(), td.matchers.anything())).thenResolve({ $metadata: {}, Body: body });
		const signal = AbortSignal.abort();
		await expect(repository.readRange({ ..._input(), signal: signal })).rejects.toBe(signal.reason);
	});

	it("preserves cancellation when the late response has no body", async () => {
		const { repository, send } = _fixture();
		td.when(send(td.matchers.anything(), td.matchers.anything())).thenResolve({ $metadata: {} });
		const signal = AbortSignal.abort();
		await expect(repository.readRange({ ..._input(), signal: signal })).rejects.toBe(signal.reason);
	});
});
