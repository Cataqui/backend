import type { ExecutionContext } from "@nestjs/common";
import * as td from "testdouble";
import type { AuthenticatedSession } from "@cataqui/auth-schemas";
import { CurrentAuthSession } from "./current-auth-session.decorator";

afterEach(() => td.reset());

const _registration = await vi.hoisted(async () => {
	const td = await import("testdouble");
	const decorator = td.func<ReturnType<typeof import("@nestjs/common").createParamDecorator>>();
	const create = td.func<typeof import("@nestjs/common").createParamDecorator>();
	td.when(create(td.matchers.anything())).thenReturn(decorator);
	return { decorator: decorator, create: create };
});

vi.mock("@nestjs/common", async (importOriginal) => ({
	...(await importOriginal<typeof import("@nestjs/common")>()),
	createParamDecorator: _registration.create,
}));

it("registers an HTTP parameter factory that returns the authenticated request's session", () => {
	const session = {
		sessionId: "session-id",
		accountId: "account-id",
		expiresAt: "2026-09-04T15:00:00.000Z",
	} satisfies AuthenticatedSession;
	const context = td.object<ExecutionContext>();
	const http = td.object<ReturnType<ExecutionContext["switchToHttp"]>>();
	td.when(context.switchToHttp()).thenReturn(http);
	td.when(http.getRequest<unknown>()).thenReturn({ authSession: session });
	const factory: ((data: unknown, context: ExecutionContext) => AuthenticatedSession) | undefined = td.explain(
		_registration.create,
	).calls[0]?.args[0];
	if (factory === undefined) throw new Error("The authentication parameter factory was not registered.");
	const result = factory(undefined, context);

	expect({
		registration: td.explain(_registration.create).calls.map((call) => call.args),
		decorator: CurrentAuthSession,
		session: result,
		http: td.explain(context.switchToHttp).calls.map((call) => call.args),
		request: td.explain(http.getRequest).calls.map((call) => call.args),
	}).toEqual({
		registration: [[factory]],
		decorator: _registration.decorator,
		session: session,
		http: [[]],
		request: [[]],
	});
});
