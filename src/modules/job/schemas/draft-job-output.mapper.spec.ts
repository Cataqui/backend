import { JobStatus, Prisma } from "../../../../generated/prisma/client.js";
import { DraftJobOutputSchema } from "./draft-job-output.schema";
import { toDraftJobOutput } from "./draft-job-output.mapper";

function _createIncompleteDatabaseDraft() {
	return {
		id: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
		posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		contactId: null,
		title: null,
		description: "Need someone to help unload a delivery truck.",
		descriptionSummary: null,
		contact: null,
		street: null,
		neighborhood: null,
		city: null,
		state: null,
		country: null,
		fuzzyLatitude: null,
		fuzzyLongitude: null,
		status: JobStatus.DRAFT,
		type: null,
		paymentType: null,
		paymentMinAmount: null,
		paymentMaxAmount: null,
		paymentNote: null,
		paymentAmountPeriod: null,
		paymentCurrency: null,
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	};
}

describe("toDraftJobOutput", () => {
	it("should map an incomplete database draft to the draft contract", () => {
		const output = toDraftJobOutput(_createIncompleteDatabaseDraft());

		expect(DraftJobOutputSchema.safeParse(output).success).toBe(true);
	});

	it("should preserve nullable publication fields on an incomplete draft", () => {
		const output = toDraftJobOutput(_createIncompleteDatabaseDraft());

		expect(output).toMatchObject({
			title: null,
			descriptionSummary: null,
			contactReference: null,
			location: null,
			payment: null,
			type: null,
		});
	});

	it("should map complete draft location and payment groups", () => {
		const output = toDraftJobOutput({
			..._createIncompleteDatabaseDraft(),
			neighborhood: "Centro",
			city: "São Paulo",
			state: "SP",
			country: "BR",
			fuzzyLatitude: new Prisma.Decimal(-23.55),
			fuzzyLongitude: new Prisma.Decimal(-46.63),
			paymentType: "FIXED" as const,
			paymentAmountPeriod: "SINGLE" as const,
			paymentCurrency: "BRL",
		});

		expect(output).toMatchObject({
			location: { latitude: -23.55, longitude: -46.63 },
			payment: { type: "FIXED", amountPeriod: "SINGLE", currency: "BRL" },
		});
	});

	it("should reject a public database row from the draft mapper", () => {
		expect(() => toDraftJobOutput({ ..._createIncompleteDatabaseDraft(), status: JobStatus.ACTIVE })).toThrow();
	});
});
