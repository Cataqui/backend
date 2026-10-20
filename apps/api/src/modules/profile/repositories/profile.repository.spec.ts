import * as td from "testdouble";
import { ContactMethod, type Prisma, type Profile } from "../../../../generated/prisma/client";
import type { PrismaService } from "../../../core/prisma/prisma.service";
import { ProfileRepository } from "./profile.repository";

afterEach(() => td.reset());

describe("ProfileRepository", () => {
	let prisma: PrismaService;
	let transaction: Prisma.TransactionClient;
	let repository: ProfileRepository;

	beforeEach(() => {
		prisma = td.object<PrismaService>();
		Object.defineProperty(prisma, "profile", { value: td.object<PrismaService["profile"]>() });
		transaction = td.object<Prisma.TransactionClient>();
		Object.defineProperty(transaction, "profile", { value: td.object<Prisma.TransactionClient["profile"]>() });
		Object.defineProperty(transaction, "contact", { value: td.object<Prisma.TransactionClient["contact"]>() });
		td.when(prisma.$transaction(td.matchers.anything())).thenDo(
			async <Result>(callback: (client: Prisma.TransactionClient) => Promise<Result>): Promise<Result> =>
				callback(transaction),
		);
		repository = new ProfileRepository(prisma);
	});

	it("looks up the profile by the authenticated account identifier", async () => {
		td.when(prisma.profile.findUnique(td.matchers.anything())).thenResolve(null);
		const result = await repository.findById({ profileId: "account" });
		expect({ result: result, input: td.explain(prisma.profile.findUnique).calls.map((call) => call.args) }).toEqual({
			result: null,
			input: [[{ where: { id: "account" } }]],
		});
	});
	it.each([
		{ count: 1, contacts: [{ method: ContactMethod.WHATSAPP, identifier: "@maria.silva" }], writesContacts: true },
		{ count: 1, contacts: [], writesContacts: false },
		{ count: 0, contacts: [{ method: ContactMethod.WHATSAPP, identifier: "@maria.silva" }], writesContacts: false },
	])(
		"writes initial contacts=$writesContacts when inserted=$count and contacts=$contacts",
		async ({ count, contacts, writesContacts }) => {
			const profile = {
				id: "account",
				name: "Maria",
				creationHash: "hash",
				createdAt: new Date(),
				updatedAt: new Date(),
			} satisfies Profile;
			td.when(transaction.profile.createMany(td.matchers.anything())).thenResolve({ count: count });
			td.when(transaction.profile.findUniqueOrThrow(td.matchers.anything())).thenResolve(profile);
			const result = await repository.createWithContacts({
				profileId: "account",
				name: "Maria",
				creationHash: "hash",
				contacts: contacts,
			});
			expect({
				result: result,
				create: td.explain(transaction.profile.createMany).calls.map((call) => call.args),
				contacts: td.explain(transaction.contact.createMany).calls.map((call) => call.args),
				find: td.explain(transaction.profile.findUniqueOrThrow).calls.map((call) => call.args),
			}).toEqual({
				result: { insertion: { count: count }, profile: profile },
				create: [[{ data: [{ id: "account", name: "Maria", creationHash: "hash" }], skipDuplicates: true }]],
				contacts: writesContacts
					? [
							[
								{
									data: [
										{ ownerProfileId: "account", contactMethod: ContactMethod.WHATSAPP, identifier: "@maria.silva" },
									],
									skipDuplicates: true,
								},
							],
						]
					: [],
				find: [[{ where: { id: "account" } }]],
			});
		},
	);

	it("keeps profile and initial contacts in the same transaction and awaits contact insertion", async () => {
		const sequence: string[] = [];
		const profile = {
			id: "account",
			name: "Maria",
			creationHash: "hash",
			createdAt: new Date(),
			updatedAt: new Date(),
		} satisfies Profile;
		td.when(transaction.profile.createMany(td.matchers.anything())).thenDo(async (): Promise<Prisma.BatchPayload> => {
			sequence.push("profile");
			return { count: 1 };
		});
		td.when(transaction.contact.createMany(td.matchers.anything())).thenDo(async (): Promise<Prisma.BatchPayload> => {
			await Promise.resolve();
			sequence.push("contacts");
			return { count: 1 };
		});
		td.when(transaction.profile.findUniqueOrThrow(td.matchers.anything())).thenDo(async (): Promise<Profile> => {
			sequence.push("read");
			return profile;
		});
		await repository.createWithContacts({
			profileId: "account",
			name: "Maria",
			creationHash: "hash",
			contacts: [{ method: ContactMethod.WHATSAPP, identifier: "@maria.silva" }],
		});
		expect(sequence).toEqual(["profile", "contacts", "read"]);
	});

	it("propagates a failed contact write so the transaction rolls back profile creation", async () => {
		const failure = new Error("contact storage unavailable");
		td.when(transaction.profile.createMany(td.matchers.anything())).thenResolve({ count: 1 });
		td.when(transaction.contact.createMany(td.matchers.anything())).thenReject(failure);
		await expect(
			repository.createWithContacts({
				profileId: "account",
				name: "Maria",
				creationHash: "hash",
				contacts: [{ method: ContactMethod.WHATSAPP, identifier: "@maria.silva" }],
			}),
		).rejects.toBe(failure);
	});

	it("leaves contacts added after onboarding untouched when the original creation is retried", async () => {
		const profile = {
			id: "account",
			name: "Maria",
			creationHash: "original-creation",
			createdAt: new Date(),
			updatedAt: new Date(),
		} satisfies Profile;
		td.when(transaction.profile.createMany(td.matchers.anything())).thenResolve({ count: 0 });
		td.when(transaction.profile.findUniqueOrThrow(td.matchers.anything())).thenResolve(profile);
		await repository.createWithContacts({
			profileId: "account",
			name: "Maria",
			creationHash: "original-creation",
			contacts: [{ method: ContactMethod.WHATSAPP, identifier: "@original.contact" }],
		});
		expect(td.explain(transaction.contact.createMany).callCount).toBe(0);
	});
});
