import {
	JobContactMethod,
	JobPaymentAmountPeriod,
	JobPaymentType,
	JobStatus,
	JobType,
} from "../../../../generated/prisma/client.js";
import { PublicJobOutputSchema } from "./public-job-output.schema";

const activePublicJobOutput = {
	jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: "Auxiliar de cozinha",
	description: "Descrição completa da oportunidade.",
	descriptionSummary: "Ajude na preparação dos alimentos e na organização da cozinha.",
	contactReference: {
		contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		contactMethod: JobContactMethod.WHATSAPP,
	},
	location: {
		neighborhood: "Centro",
		city: "São Paulo",
		state: "SP",
		country: "BR",
		latitude: -23.55,
		longitude: -46.63,
		areaRadius: 2_000,
	},
	payment: {
		type: JobPaymentType.FIXED,
		minAmount: 150,
		maxAmount: null,
		note: null,
		amountPeriod: JobPaymentAmountPeriod.SINGLE,
		currency: "BRL",
	},
	status: JobStatus.ACTIVE,
	type: JobType.INDIVIDUAL,
	createdAt: "2026-08-09T12:00:00.000Z",
	updatedAt: "2026-08-09T12:00:00.000Z",
};

describe("PublicJobOutputSchema", () => {
	it("should accept a complete active public job", () => {
		expect(PublicJobOutputSchema.safeParse(activePublicJobOutput).success).toBe(true);
	});

	it.each(["title", "descriptionSummary", "location", "payment", "type"] as const)(
		"should reject a public job whose required %s field is null",
		(field) => {
			expect(PublicJobOutputSchema.safeParse({ ...activePublicJobOutput, [field]: null }).success).toBe(false);
		},
	);

	it("should reject an active public job without a contact reference", () => {
		const { contactReference: _contactReference, ...jobWithoutContactReference } = activePublicJobOutput;

		expect(PublicJobOutputSchema.safeParse(jobWithoutContactReference).success).toBe(false);
	});

	it("should accept a closed public job with its contact reference", () => {
		expect(PublicJobOutputSchema.safeParse({ ...activePublicJobOutput, status: JobStatus.CLOSED }).success).toBe(true);
	});

	it("should reject a closed public job without a contact reference", () => {
		const { contactReference: _contactReference, ...jobWithoutContactReference } = activePublicJobOutput;

		expect(PublicJobOutputSchema.safeParse({ ...jobWithoutContactReference, status: JobStatus.CLOSED }).success).toBe(
			false,
		);
	});

	it("should reject a draft from the public contract", () => {
		expect(PublicJobOutputSchema.safeParse({ ...activePublicJobOutput, status: JobStatus.DRAFT }).success).toBe(false);
	});
});
