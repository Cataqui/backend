import { AppErrorCode } from "../errors/index";

import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { once } from "node:events";
import * as td from "testdouble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineAssetsService } from "./engine-assets.service";
import { RendererProcessRepository } from "./renderer-process.repository";
import type { EngineMapRenderInput } from "./engine-map-render-input.interface";

afterEach(() => td.reset());

const _fixtures = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		children: [] as ChildProcessWithoutNullStreams[],
		spawn:
			td.func<
				(command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams
			>(),
	};
});
const _actualChildProcess = await vi.importActual<typeof import("node:child_process")>("node:child_process");
vi.mock("node:child_process", async (original) => {
	const actual = await original<typeof import("node:child_process")>();
	return { ...actual, spawn: _fixtures.spawn };
});

const _repositories: RendererProcessRepository[] = [];

function _repository(params: { behavior?: string; executable?: string } = {}): RendererProcessRepository {
	const code = `
const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line', (line) => {
 const input=JSON.parse(line);
 const reply={id:input.id,ok:true,raw:input.op};
 ${params.behavior ?? ""}
 process.stdout.write(JSON.stringify(reply)+'\\n');
});`;
	vi.stubEnv("MAPSHOT_RENDERER_PATH", params.executable ?? process.execPath);
	td.when(_fixtures.spawn(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenDo(
		(command: string, _args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams => {
			const child = _actualChildProcess.spawn(command, ["-e", code], { ...options, stdio: "pipe" });
			_fixtures.children.push(child);
			return child;
		},
	);
	const assets = td.object<EngineAssetsService>();
	Object.defineProperty(assets, "fontRoot", { value: "/tmp/verified-fonts" });
	const repository = new RendererProcessRepository(assets);
	_repositories.push(repository);
	return repository;
}

afterEach(async () => {
	await Promise.all(_repositories.splice(0).map((repository) => repository.close()));
	_fixtures.children.length = 0;
	vi.unstubAllEnvs();
});

describe("renderer process repository", () => {
	it("uses one persistent process and returns the decoded response without interpreting it", async () => {
		const repository = _repository({ behavior: "reply.ok=false;reply.error='provider diagnostic';delete reply.id;" });
		expect(repository.running).toBe(false);
		await repository.start();
		await repository.start();
		expect(repository.running).toBe(true);
		const first = await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) });
		const second = await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) });
		expect(first).toEqual({ id: 1, value: { ok: false, raw: "ready", error: "provider diagnostic" } });
		expect(second.id).toBe(2);
		expect(_fixtures.children).toHaveLength(1);
	});

	it("returns malformed operation payloads without imposing the render contract", async () => {
		const repository = _repository({ behavior: "process.stdout.write('null\\n');return;" });
		await repository.start();
		expect(await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) })).toEqual({
			id: 1,
			value: null,
		});
	});

	it("rejects requests without a running child", async () => {
		await expect(
			_repository().request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) }),
		).rejects.toMatchObject({
			errorCode: AppErrorCode.RENDERER_PROCESS_UNAVAILABLE,
			message: "Renderer process transport failed: UNAVAILABLE.",
		});
	});

	it("kills a cancelled child and waits for its close before returning", async () => {
		const repository = _repository({ behavior: "return;" });
		await repository.start();
		const child = _fixtures.children.at(-1)!;
		const controller = new AbortController();
		const request = repository.request({ operation: { op: "ready" }, signal: controller.signal });
		const rejected = expect(request).rejects.toMatchObject({
			errorCode: AppErrorCode.RENDERER_PROCESS_CLOSED,
			message: "Renderer process transport failed: CLOSED.",
		});
		controller.abort();
		await rejected;
		expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
		expect(repository.running).toBe(false);
		await repository.start();
		expect(_fixtures.children).toHaveLength(2);
	});

	it("does not write to a child for an already cancelled request", async () => {
		const repository = _repository();
		await repository.start();
		const write = vi.spyOn(_fixtures.children.at(-1)!.stdin!, "write");
		await expect(repository.request({ operation: { op: "ready" }, signal: AbortSignal.abort() })).rejects.toMatchObject(
			{
				errorCode: AppErrorCode.RENDERER_PROCESS_CLOSED,
				message: "Renderer process transport failed: CLOSED.",
			},
		);
		expect(write).not.toHaveBeenCalled();
	});

	it.each([
		{ behavior: "process.stdout.write('invalid\\n');return;", name: "SyntaxError" },
		{ behavior: "process.stdout.write(Buffer.from([255,10]));return;", name: "TypeError" },
	])("preserves raw decoding failures: $name", async ({ behavior, name }) => {
		const repository = _repository({ behavior: behavior });
		await repository.start();
		await expect(
			repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) }),
		).rejects.toMatchObject({
			name: name,
		});
	});

	it("rejects multiple frames and stops the failed child", async () => {
		const repository = _repository({
			behavior: "process.stdout.write(JSON.stringify(reply)+'\\n'+JSON.stringify(reply)+'\\n');return;",
		});
		await repository.start();
		await expect(
			repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) }),
		).rejects.toMatchObject({
			errorCode: AppErrorCode.INVALID_RENDERER_FRAME,
			message: "Renderer process transport failed: INVALID_FRAME.",
		});
		expect(repository.running).toBe(false);
	});

	it("accepts a complete response larger than the former 32 MiB frame cap", async () => {
		const repository = _repository({
			behavior: "process.stdout.write(JSON.stringify('x'.repeat(32*1024*1024+1))+'\\n');return;",
		});
		await repository.start();
		const response = await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) });
		expect(response.value).toHaveLength(32 * 1024 * 1024 + 1);
	});

	it("delivers a render request larger than the former 128 MiB request cap", async () => {
		const repository = _repository({ behavior: "reply.tileBytes=input.map.tiles[0].bytes.length;" });
		await repository.start();
		const map = {
			camera: { latitude: 0, longitude: 0, zoom: 13, width: 16, height: 16, pixelRatio: 2 },
			tiles: [{ key: "0/0/0", address: { z: 0, x: 0, y: 0 }, bytes: "x".repeat(128 * 1024 * 1024 + 1) }],
			landmarks: {
				candidates: [],
				style: {
					badgeRadius: 9,
					badgeStrokeWidth: 1.25,
					labelGap: 3,
					edgeMargin: 6,
					labelFontSize: 10,
					labelMaxWidth: 80,
					labelMaxLines: 3,
					labelLineHeight: 12,
					labelLetterSpacing: -0.2,
					labelHaloWidth: 2,
				},
			},
		} satisfies EngineMapRenderInput;
		const response = await repository.request({
			operation: { op: "render", map: map },
			signal: AbortSignal.timeout(10_000),
		});
		expect(response.value).toMatchObject({ raw: "render", tileBytes: 128 * 1024 * 1024 + 1 });
	});

	it("preserves executable spawn failures from Node", async () => {
		const repository = _repository({ executable: "/does-not-exist" });
		await repository.start();
		await expect(
			repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) }),
		).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("handles chunked lines and drains stderr", async () => {
		const repository = _repository({
			behavior:
				"process.stderr.write('private diagnostic');const text=JSON.stringify(reply);process.stdout.write(text.slice(0,4));setTimeout(()=>process.stdout.write(text.slice(4)+'\\n'),5);return;",
		});
		await repository.start();
		expect(await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) })).toEqual({
			id: 1,
			value: { id: 1, ok: true, raw: "ready" },
		});
	});

	it("restarts a child that exits while idle", async () => {
		const repository = _repository({
			behavior: "process.stdout.write(JSON.stringify(reply)+'\\n',()=>process.exit(0));return;",
		});
		await repository.start();
		const child = _fixtures.children.at(-1)!;
		const closed = once(child, "close");
		await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) });
		await closed;
		await repository.start();
		expect(repository.running).toBe(true);
		expect(_fixtures.children).toHaveLength(2);
	});

	it("stops the child and waits for its death before releasing process state", async () => {
		const repository = _repository();
		await repository.start();
		const child = _fixtures.children.at(-1)!;
		await repository.kill();
		expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
		expect(repository.running).toBe(false);
		await repository.kill();
	});

	it("bounds graceful EOF shutdown if the child keeps another handle alive", async () => {
		const repository = _repository({ behavior: "process.stdin.on('end',()=>setInterval(()=>{},100));" });
		await repository.start();
		await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) });
		await repository.close();
		expect(repository.running).toBe(false);
	});

	it("supports environment paths and cleanup before startup", async () => {
		vi.stubEnv("MAPSHOT_RENDERER_PATH", process.execPath);
		vi.stubEnv("MAPSHOT_FONT_DIR", "/tmp/owned-fonts");
		const assets = td.object<EngineAssetsService>();
		const environment = new RendererProcessRepository(assets);
		await environment.kill();
		await environment.close();
		vi.stubEnv("MAPSHOT_RENDERER_PATH", undefined);
		vi.stubEnv("MAPSHOT_FONT_DIR", undefined);
		await new RendererProcessRepository(assets).close();
	});

	it("uses the injected assets font root instead of an unverified environment path", async () => {
		vi.stubEnv("MAPSHOT_FONT_DIR", "/tmp/unverified-fonts");
		const repository = _repository({ behavior: "reply.fontDirectory=process.env.MAPSHOT_FONT_DIR;" });
		await repository.start();
		const response = await repository.request({ operation: { op: "ready" }, signal: AbortSignal.timeout(2000) });
		expect(response.value).toMatchObject({ fontDirectory: "/tmp/verified-fonts" });
	});
});
