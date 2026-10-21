import * as td from "testdouble";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";

afterEach(() => td.reset());

it("uses the Auth account ID for authenticated Maps operations", async () => {
	const repository = td.object<AuthRepository>();
	const session = {
		accountId: "account-id",
	} satisfies NonNullable<Awaited<ReturnType<AuthRepository["resolveSession"]>>>;
	td.when(repository.resolveSession({ accessToken: "token" })).thenResolve(session);
	const service = new AuthService(repository);

	await expect(service.getAuthenticatedAccountIdOrNull({ accessToken: "token" })).resolves.toBe("account-id");
	td.verify(repository.resolveSession({ accessToken: "token" }));
});

it("returns absence for an invalid or expired access token", async () => {
	const repository = td.object<AuthRepository>();
	td.when(repository.resolveSession({ accessToken: "token" })).thenResolve(null);
	await expect(
		new AuthService(repository).getAuthenticatedAccountIdOrNull({ accessToken: "token" }),
	).resolves.toBeNull();
});

it("does not turn an Auth outage into invalid credentials", async () => {
	const repository = td.object<AuthRepository>();
	const failure = new Error("Auth unavailable");
	td.when(repository.resolveSession({ accessToken: "token" })).thenReject(failure);
	await expect(new AuthService(repository).getAuthenticatedAccountIdOrNull({ accessToken: "token" })).rejects.toBe(
		failure,
	);
});
