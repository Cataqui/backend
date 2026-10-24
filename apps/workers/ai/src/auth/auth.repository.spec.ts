import * as td from "testdouble";
import type { AiWorkerEnv } from "../../cloudflare.config.ts";
import { AuthRepository } from "./auth.repository";

afterEach(() => td.reset());

it("copies the account ID and releases the Auth RPC session", async () => {
	const auth = td.object<AiWorkerEnv["AUTH"]>();
	const dispose = td.func<() => void>();
	const session = {
		accountId: "account-id",
		sessionId: "session-id",
		expiresAt: "2026-10-24T12:00:00.000Z",
		[Symbol.dispose]: dispose,
	} satisfies NonNullable<Awaited<ReturnType<AiWorkerEnv["AUTH"]["resolveSession"]>>>;
	td.when(auth.resolveSession({ accessToken: "access-token" })).thenResolve(session);
	await expect(new AuthRepository(auth).resolveSession({ accessToken: "access-token" })).resolves.toEqual({
		accountId: "account-id",
	});
	td.verify(dispose(), { times: 1 });
});

it("preserves an absent Auth session", async () => {
	const auth = td.object<AiWorkerEnv["AUTH"]>();
	td.when(auth.resolveSession({ accessToken: "access-token" })).thenResolve(null);
	await expect(new AuthRepository(auth).resolveSession({ accessToken: "access-token" })).resolves.toBeNull();
});

it("leaves Auth provider failures for the service to interpret", async () => {
	const auth = td.object<AiWorkerEnv["AUTH"]>();
	const failure = new Error("private provider error");
	td.when(auth.resolveSession({ accessToken: "access-token" })).thenReject(failure);
	await expect(new AuthRepository(auth).resolveSession({ accessToken: "access-token" })).rejects.toBe(failure);
});
