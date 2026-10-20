import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import * as td from "testdouble";
import { AuthenticationGuard } from "./authentication.guard";
import { Public } from "./decorators/public.decorator";
import { AccessTokenRequiredError } from "./errors/access-token-required.error";
import type { IAuthenticatedRequest } from "./interfaces/authenticated-request.interface";

afterEach(() => td.reset());

const _session = {
	accountId: "cdb992de-bd4a-4778-8562-b0a97ea74cdc",
	sessionId: "9d8ed92a-21de-4414-a52e-04e939667c53",
	expiresAt: "2026-10-20T12:00:00.000Z",
} satisfies AuthenticatedSession;

class ControllerFixture {
	@Public()
	publicRoute(): void {}

	protectedRoute(): void {}
}

@Public()
class PublicControllerFixture {
	handle(): void {}
}

function _createContext(params: {
	url?: string;
	headers?: FastifyRequest["headers"];
	handler?: ReturnType<ExecutionContext["getHandler"]>;
	controller?: ReturnType<ExecutionContext["getClass"]>;
}): { context: ExecutionContext; request: FastifyRequest } {
	const context = td.object<ExecutionContext>();
	const http = td.object<ReturnType<ExecutionContext["switchToHttp"]>>();
	const request = Object.assign(td.object<FastifyRequest>(), {
		method: "GET",
		url: params.url ?? "/v1/feed",
		headers: params.headers ?? {},
	});
	td.when(context.getHandler()).thenReturn(params.handler ?? ControllerFixture.prototype.protectedRoute);
	td.when(context.getClass()).thenReturn(params.controller ?? ControllerFixture);
	td.when(context.switchToHttp()).thenReturn(http);
	td.when(http.getRequest<FastifyRequest>()).thenReturn(request);
	return { context: context, request: request };
}

describe("AuthenticationGuard", () => {
	let guard: AuthenticationGuard;
	beforeEach(() => {
		guard = new AuthenticationGuard(new Reflector());
	});

	it("allows a handler marked public without reading session context", () => {
		const { context } = _createContext({ handler: ControllerFixture.prototype.publicRoute });
		expect(guard.canActivate(context)).toBe(true);
		expect(td.explain(context.switchToHttp).callCount).toBe(0);
	});

	it("allows a handler on a controller marked public", () => {
		const { context } = _createContext({
			controller: PublicControllerFixture,
			handler: PublicControllerFixture.prototype.handle,
		});
		expect(guard.canActivate(context)).toBe(true);
	});

	it("attaches the trusted serialized session to protected requests", () => {
		const { context, request } = _createContext({
			headers: { "x-cataqui-auth-session": JSON.stringify(_session) },
		});
		expect(guard.canActivate(context)).toBe(true);
		expect((request as IAuthenticatedRequest).authSession).toEqual(_session);
	});

	it.each([undefined, ["session"]])("rejects a missing forwarded session %s", (serializedSession) => {
		const { context } = _createContext({ headers: { "x-cataqui-auth-session": serializedSession } });
		expect(() => guard.canActivate(context)).toThrow(AccessTokenRequiredError);
	});

	it("preserves a malformed trusted representation as a serialization failure", () => {
		const { context } = _createContext({ headers: { "x-cataqui-auth-session": "{" } });
		expect(() => guard.canActivate(context)).toThrow(SyntaxError);
	});

	it("requires a forwarded identity even if a raw bearer credential reaches the container", () => {
		const { context } = _createContext({ headers: { authorization: `Bearer ${"a".repeat(43)}` } });
		expect(() => guard.canActivate(context)).toThrow(AccessTokenRequiredError);
	});

	it.each(["/v1/health", "/docs", "/v1/feed"])("requires metadata to exempt the handler at %s", (url) => {
		const { context } = _createContext({ url: url });
		expect(() => guard.canActivate(context)).toThrow(AccessTokenRequiredError);
	});
});
