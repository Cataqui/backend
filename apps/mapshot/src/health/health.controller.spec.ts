import * as td from "testdouble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NativeRenderHealthOutput } from "./schemas/native-render-health-output.schema";
import { createHealthHandler } from "./health.controller";
import { AppErrorCode } from "../errors/app-error-code.enum";

afterEach(() => td.reset());

let _ready: () => boolean;
let _indexes: () => NativeRenderHealthOutput["indexes"];

beforeEach(() => {
	_ready = td.func<() => boolean>();
	_indexes = td.func<() => NativeRenderHealthOutput["indexes"]>();
	td.when(_ready()).thenReturn(true);
});

describe("Health HTTP controller", () => {
	it("reports readiness and installed indexes", async () => {
		const indexes = { archiveId: "a".repeat(64), sha256: "b".repeat(64) } satisfies NativeRenderHealthOutput["indexes"];
		td.when(_indexes()).thenReturn(indexes);
		const app = createHealthHandler({ ready: _ready, indexes: _indexes });
		const response = await app(new Request("http://container/health"));
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.json()).toEqual({
			ready: true,
			indexes: indexes,
		});
	});

	it("reports readiness when index identity is unavailable", async () => {
		const app = createHealthHandler({ ready: _ready });
		const response = await app(new Request("http://container/health"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ready: true });
	});

	it("reads the current readiness for every health check", async () => {
		td.when(_ready()).thenReturn(false, true);
		const app = createHealthHandler({ ready: _ready, indexes: _indexes });
		const unavailable = await app(new Request("http://container/health"));
		expect(unavailable.status).toBe(503);
		expect(await unavailable.json()).toEqual({ errorCode: AppErrorCode.NOT_READY });
		td.verify(_indexes(), { times: 0 });
		expect((await app(new Request("http://container/health"))).status).toBe(200);
	});

	it.each([
		{ method: "GET", path: "/render" },
		{ method: "POST", path: "/render" },
		{ method: "POST", path: "/drain" },
		{ method: "POST", path: "/health" },
		{ method: "HEAD", path: "/health" },
		{ method: "GET", path: "/health?debug=1" },
	])("rejects unsupported HTTP target $method $path", async ({ method, path }) => {
		const app = createHealthHandler({ ready: _ready, indexes: _indexes });
		const response = await app(new Request(new URL(path, "http://container"), { method: method }));
		expect(response.status).toBe(404);
		if (method !== "HEAD") expect(await response.json()).toEqual({ errorCode: AppErrorCode.NOT_FOUND });
		td.verify(_ready(), { times: 0 });
		td.verify(_indexes(), { times: 0 });
	});

	it("sanitizes unexpected health errors", async () => {
		td.when(_indexes()).thenThrow(new Error("private index path and provider credentials"));
		const app = createHealthHandler({ ready: _ready, indexes: _indexes });
		const response = await app(new Request("http://container/health"));
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ errorCode: AppErrorCode.HEALTH_CHECK_FAILED });
	});
});
