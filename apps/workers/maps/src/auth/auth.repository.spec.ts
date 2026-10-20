import type { MapsWorkerEnv } from "../../cloudflare.config.ts";
import * as td from "testdouble";
import { AuthRepository } from "./auth.repository";

afterEach(() => td.reset());

it("maps a verified session from Auth's public binding", async () => {
	const auth = td.object<MapsWorkerEnv["AUTH"]>();
	const dispose = td.func<() => void>();
	const session = {
		accountId: "account-id",
		sessionId: "session-id",
		expiresAt: "2026-10-19T12:00:00.000Z",
		[Symbol.dispose]: dispose,
	} satisfies NonNullable<Awaited<ReturnType<MapsWorkerEnv["AUTH"]["resolveSession"]>>>;
	td.when(auth.resolveSession({ accessToken: "access-token" })).thenResolve(session);
	const repository = new AuthRepository(auth);

	await expect(repository.resolveSession({ accessToken: "access-token" })).resolves.toEqual({
		accountId: "account-id",
	});
	td.verify(auth.resolveSession({ accessToken: "access-token" }));
	td.verify(dispose());
});

it("preserves Auth's absent session result", async () => {
	const auth = td.object<MapsWorkerEnv["AUTH"]>();
	td.when(auth.resolveSession({ accessToken: "access-token" })).thenResolve(null);
	await expect(new AuthRepository(auth).resolveSession({ accessToken: "access-token" })).resolves.toBeNull();
});

it("preserves Auth failures for the service and transport", async () => {
	const auth = td.object<MapsWorkerEnv["AUTH"]>();
	const failure = new Error("Auth unavailable");
	td.when(auth.resolveSession({ accessToken: "access-token" })).thenReject(failure);
	await expect(new AuthRepository(auth).resolveSession({ accessToken: "access-token" })).rejects.toBe(failure);
});
