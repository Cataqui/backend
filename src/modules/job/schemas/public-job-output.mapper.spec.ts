import { JobContactMethod, JobStatus, Prisma } from "../../../../generated/prisma/client.js";
import { PublicJobOutputSchema } from "./public-job-output.schema";
import { toPublicJobOutput } from "./public-job-output.mapper";

function _createPublicDatabaseJob() {
	return {
		id: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
		posterUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		title: "Help unload truck",
		description: "Need someone to help unload a delivery truck.",
		descriptionSummary: "Paid moving help available today.",
		contact: {
			id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			contactMethod: "WHATSAPP" as const,
			identifier: "+5511999999999",
			createdAt: new Date("2026-05-28T10:00:00.000Z"),
		},
		street: "Rua das Flores, 123",
		neighborhood: "Centro",
		city: "São Paulo",
		state: "SP",
		country: "BR",
		fuzzyLatitude: new Prisma.Decimal(-23.55),
		fuzzyLongitude: new Prisma.Decimal(-46.63),
		status: JobStatus.ACTIVE,
		type: "INDIVIDUAL" as const,
		paymentType: "FIXED" as const,
		paymentMinAmount: new Prisma.Decimal(150),
		paymentMaxAmount: null,
		paymentNote: null,
		paymentAmountPeriod: "SINGLE" as const,
		paymentCurrency: "BRL",
		createdAt: new Date("2026-05-28T10:00:00.000Z"),
		updatedAt: new Date("2026-05-28T10:00:00.000Z"),
	};
}

describe("toPublicJobOutput", () => {
	it("should map a complete database job to the public contract", () => {
		const output = toPublicJobOutput(_createPublicDatabaseJob());

		expect(PublicJobOutputSchema.safeParse(output).success).toBe(true);
	});

	it("should expose the active job contact reference", () => {
		const output = toPublicJobOutput(_createPublicDatabaseJob());

		expect("contactReference" in output ? output.contactReference : undefined).toEqual({
			contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			contactMethod: JobContactMethod.WHATSAPP,
		});
	});

	it("should preserve the contact reference on a closed public job", () => {
		const output = toPublicJobOutput({ ..._createPublicDatabaseJob(), status: JobStatus.CLOSED });

		expect(output.contactReference).toEqual({
			contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			contactMethod: JobContactMethod.WHATSAPP,
		});
	});

	it("should map required fuzzy database coordinates directly", () => {
		const output = toPublicJobOutput(_createPublicDatabaseJob());

		expect(output.location).toMatchObject({ latitude: -23.55, longitude: -46.63, areaRadius: 2_000 });
	});

	it("should map Prisma payment decimals to public numbers", () => {
		const output = toPublicJobOutput(_createPublicDatabaseJob());

		expect(output.payment.minAmount).toBe(150);
	});

	it("should reject a public database row with incomplete payment", () => {
		expect(() => toPublicJobOutput({ ..._createPublicDatabaseJob(), paymentType: null })).toThrow();
	});

	it("should reject a public database row with incomplete location", () => {
		expect(() => toPublicJobOutput({ ..._createPublicDatabaseJob(), fuzzyLatitude: null })).toThrow();
	});

	it("should reject an active public database row without contact", () => {
		expect(() => toPublicJobOutput({ ..._createPublicDatabaseJob(), contact: null })).toThrow();
	});

	it("should return camelCase identifiers and ISO timestamps", () => {
		const output = toPublicJobOutput(_createPublicDatabaseJob());

		expect(output).toMatchObject({
			jobId: "afdfd9b2-203d-4528-8a1c-82b6b139039b",
			createdAt: "2026-05-28T10:00:00.000Z",
			updatedAt: "2026-05-28T10:00:00.000Z",
		});
	});
});
