import * as td from "testdouble";
import { ContactMethod } from "../../../../generated/prisma/client";
import type { PrismaService } from "../../../core/prisma/prisma.service";
import { ContactRepository } from "./contact.repository";

const ownerProfileId = "f3f3f078-9332-4879-9904-6565abc5d88d";

afterEach(() => td.reset());

describe("ContactRepository", () => {
	const prisma = td.object<PrismaService>();
	const repository = new ContactRepository(prisma);

	beforeEach(() => {
		Object.defineProperty(prisma, "contact", { value: td.object<PrismaService["contact"]>(), configurable: true });
	});

	it("creates or reuses a profile's immutable contact", async () => {
		await repository.upsertContact({
			ownerProfileId: ownerProfileId,
			contactMethod: ContactMethod.WHATSAPP,
			identifier: "@cataqui.poster",
		});
		td.verify(
			prisma.contact.upsert({
				where: {
					ownerProfileId_contactMethod_identifier: {
						ownerProfileId: ownerProfileId,
						contactMethod: ContactMethod.WHATSAPP,
						identifier: "@cataqui.poster",
					},
				},
				update: {},
				create: {
					ownerProfileId: ownerProfileId,
					contactMethod: ContactMethod.WHATSAPP,
					identifier: "@cataqui.poster",
				},
			}),
		);
	});

	it("lists one profile's contacts newest first", async () => {
		await repository.findContactsByOwnerProfileId({ ownerProfileId: ownerProfileId });
		td.verify(prisma.contact.findMany({ where: { ownerProfileId: ownerProfileId }, orderBy: { createdAt: "desc" } }));
	});
});
