import * as td from "testdouble";
import type { z } from "zod";
import { ContactMethod, type Profile } from "../../../generated/prisma/client";
import type { ContactInputSchema } from "../contact/schemas/contact-input.schema";
import { ProfileCreationConflictError } from "./errors/profile-creation-conflict.error";
import { ProfileNotFoundError } from "./errors/profile-not-found.error";
import { ProfileRequiredError } from "./errors/profile-required.error";
import { ProfileService } from "./profile.service";
import type { ProfileRepository } from "./repositories/profile.repository";

afterEach(() => td.reset());

function _profile(params: { name: string; creationHash: string }): Profile {
	return {
		id: "profile",
		name: params.name,
		creationHash: params.creationHash,
		createdAt: new Date("2026-10-19T12:00:00Z"),
		updatedAt: new Date("2026-10-19T12:00:00Z"),
	};
}

function _stubCreation(params: { repository: ProfileRepository; count: number }): void {
	td.when(params.repository.createWithContacts(td.matchers.anything())).thenDo(
		async (
			input: Parameters<ProfileRepository["createWithContacts"]>[0],
		): Promise<Awaited<ReturnType<ProfileRepository["createWithContacts"]>>> => ({
			insertion: { count: params.count },
			profile: _profile({ name: input.name, creationHash: input.creationHash }),
		}),
	);
}

describe("ProfileService", () => {
	let repository: ProfileRepository;
	let service: ProfileService;
	beforeEach(() => {
		repository = td.object<ProfileRepository>();
		service = new ProfileService(repository);
	});

	it.each([
		{ count: 1, created: true },
		{ count: 0, created: false },
	])("reports created=$created when the atomic insertion count is $count", async ({ count, created }) => {
		_stubCreation({ repository: repository, count: count });
		await expect(
			service.create({ profileId: "profile", input: { name: "Maria", initialContacts: [] } }),
		).resolves.toEqual({
			created: created,
			profile: { profileId: "profile", name: "Maria" },
		});
	});
	it("uses a stable fingerprint for the same contact selection in any order", async () => {
		_stubCreation({ repository: repository, count: 1 });
		const whatsapp = { method: ContactMethod.WHATSAPP, identifier: "@maria.silva" } satisfies z.infer<
			typeof ContactInputSchema
		>;
		const phone = { method: ContactMethod.PHONE_CALL, identifier: "+5511999999999" } satisfies z.infer<
			typeof ContactInputSchema
		>;
		await service.create({ profileId: "profile", input: { name: "Maria", initialContacts: [whatsapp, phone] } });
		await service.create({
			profileId: "profile",
			input: { name: "Maria", initialContacts: [phone, whatsapp, whatsapp] },
		});
		const calls = td.explain(repository.createWithContacts).calls;
		expect({ first: calls[0]?.args[0], second: calls[1]?.args[0] }).toEqual({
			first: expect.objectContaining({ profileId: "profile", name: "Maria", contacts: [phone, whatsapp] }),
			second: calls[0]?.args[0],
		});
	});
	it("distinguishes the same-method contacts when generating the stable creation fingerprint", async () => {
		_stubCreation({ repository: repository, count: 1 });
		const first = { method: ContactMethod.WHATSAPP, identifier: "@ana.silva" } satisfies z.infer<
			typeof ContactInputSchema
		>;
		const second = { method: ContactMethod.WHATSAPP, identifier: "@maria.silva" } satisfies z.infer<
			typeof ContactInputSchema
		>;
		await service.create({ profileId: "profile", input: { name: "Maria", initialContacts: [second, first] } });
		expect(td.explain(repository.createWithContacts).calls[0]?.args[0]).toEqual(
			expect.objectContaining({ contacts: [first, second] }),
		);
	});
	it("rejects a retry whose onboarding information differs from the persisted creation", async () => {
		td.when(repository.createWithContacts(td.matchers.anything())).thenResolve({
			insertion: { count: 0 },
			profile: _profile({ name: "Maria", creationHash: "different" }),
		} satisfies Awaited<ReturnType<ProfileRepository["createWithContacts"]>>);
		await expect(
			service.create({ profileId: "profile", input: { name: "Other", initialContacts: [] } }),
		).rejects.toThrow(ProfileCreationConflictError);
	});
	it("preserves database failures during profile creation", async () => {
		const failure = new Error("storage unavailable");
		td.when(repository.createWithContacts(td.matchers.anything())).thenReject(failure);
		await expect(service.create({ profileId: "profile", input: { name: "Maria", initialContacts: [] } })).rejects.toBe(
			failure,
		);
	});
	it("returns only the public profile fields", async () => {
		td.when(repository.findById({ profileId: "profile" })).thenResolve(
			_profile({ name: "Maria", creationHash: "private" }),
		);
		await expect(service.getCurrent({ profileId: "profile" })).resolves.toEqual({
			profileId: "profile",
			name: "Maria",
		});
	});
	it("reports the absent profile when an account has not completed onboarding", async () => {
		td.when(repository.findById({ profileId: "profile" })).thenResolve(null);
		await expect(service.getCurrent({ profileId: "profile" })).rejects.toThrow(ProfileNotFoundError);
	});
	it("confirms an existing profile for an operation that requires onboarding", async () => {
		const profile = _profile({ name: "Maria", creationHash: "private" });
		td.when(repository.findById({ profileId: "profile" })).thenResolve(profile);
		await expect(service.requireExists({ profileId: "profile" })).resolves.toBeUndefined();
	});
	it("requires onboarding before a profile-owned write", async () => {
		td.when(repository.findById({ profileId: "profile" })).thenResolve(null);
		await expect(service.requireExists({ profileId: "profile" })).rejects.toThrow(ProfileRequiredError);
	});
});
