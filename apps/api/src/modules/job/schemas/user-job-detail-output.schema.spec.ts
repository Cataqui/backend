import { UserJobDetailOutputSchema } from "./user-job-detail-output.schema";

const detail = {
	jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: "Ajudante",
	description: "Ajudar a carregar caixas",
	descriptionSummary: "Hoje à tarde",
	contact: { method: "WHATSAPP", identifier: "+5511999999999" },
	location: { title: "Rua Pardal Branco, 32", latitude: -23, longitude: -46, areaRadius: 2000 },
	payment: "R$ 100",
	status: "ACTIVE",
	createdAt: "2026-09-22T12:00:00Z",
	updatedAt: "2026-09-22T12:00:00Z",
};

describe("UserJobDetailOutputSchema", () => {
	it("accepts active and archived jobs with full or removed contact", () => {
		expect(UserJobDetailOutputSchema.safeParse(detail).success).toBe(true);
		expect(UserJobDetailOutputSchema.safeParse({ ...detail, status: "ARCHIVED", contact: null }).success).toBe(true);
	});

	it("requires a location title and never exposes a public contact reference", () => {
		expect(
			UserJobDetailOutputSchema.safeParse({ ...detail, location: { latitude: -23, longitude: -46, areaRadius: 2000 } })
				.success,
		).toBe(false);
		expect(
			UserJobDetailOutputSchema.safeParse({
				...detail,
				contactReference: { contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
			}).success,
		).toBe(false);
	});
});
