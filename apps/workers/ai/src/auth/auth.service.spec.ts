import * as td from "testdouble";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { AuthUnavailableError } from "./errors/auth-unavailable.error";
import { UnauthenticatedError } from "./errors/unauthenticated.error";

afterEach(() => td.reset());

it("authenticates with the account from the resolved session", async () => {
	const repository = td.object<AuthRepository>();
	td.when(repository.resolveSession({ accessToken: "access-token" })).thenResolve({ accountId: "account-id" });
	await expect(new AuthService(repository).authenticate({ accessToken: "access-token" })).resolves.toBe("account-id");
});

it("rejects an absent session as unauthenticated", async () => {
	const repository = td.object<AuthRepository>();
	td.when(repository.resolveSession({ accessToken: "access-token" })).thenResolve(null);
	await expect(new AuthService(repository).authenticate({ accessToken: "access-token" })).rejects.toBeInstanceOf(
		UnauthenticatedError,
	);
});

it("translates an Auth provider failure into the owned availability error", async () => {
	const repository = td.object<AuthRepository>();
	td.when(repository.resolveSession({ accessToken: "access-token" })).thenReject(new Error("private provider error"));
	await expect(new AuthService(repository).authenticate({ accessToken: "access-token" })).rejects.toBeInstanceOf(
		AuthUnavailableError,
	);
});
