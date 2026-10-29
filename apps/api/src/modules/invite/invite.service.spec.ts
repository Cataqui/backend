import * as td from "testdouble";
import { InviteUnavailableError } from "./errors/invite-unavailable.error";
import { InviteService } from "./invite.service";
import { InviteRepository } from "./repositories/invite.repository";

afterEach(() => td.reset());

describe("InviteService", () => {
	it.each([
		null,
		{ id: "invite", enabled: false, maxUses: null, uses: 0 },
		{ id: "invite", enabled: true, maxUses: 1, uses: 1 },
		{ id: "invite", enabled: true, maxUses: 1, uses: 2 },
	])("rejects unavailable invite code state %j", async (invite) => {
		const repository = td.object<InviteRepository>();
		td.when(repository.findAndLockByCode({ code: "CODE" })).thenResolve(invite);
		await expect(new InviteService(repository).lockAvailableByCode({ code: "CODE" })).rejects.toBeInstanceOf(
			InviteUnavailableError,
		);
	});

	it.each([
		{ maxUses: null, uses: 100 },
		{ maxUses: 2, uses: 1 },
	])("returns the identifier of an available code with capacity %j", async ({ maxUses, uses }) => {
		const repository = td.object<InviteRepository>();
		td.when(repository.findAndLockByCode({ code: "CODE" })).thenResolve({
			id: "invite",
			enabled: true,
			maxUses: maxUses,
			uses: uses,
		});
		expect(await new InviteService(repository).lockAvailableByCode({ code: "CODE" })).toEqual({ id: "invite" });
	});

	it("propagates repository failures", async () => {
		const repository = td.object<InviteRepository>();
		const failure = new Error("read failed");
		td.when(repository.findAndLockByCode({ code: "CODE" })).thenReject(failure);
		await expect(new InviteService(repository).lockAvailableByCode({ code: "CODE" })).rejects.toBe(failure);
	});
});
