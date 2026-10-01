import { UserJobOutputSchema } from "./user-job-output.schema";

const detail = {
	jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	description: "Ajudar a carregar caixas",
	contact: { method: "WHATSAPP", identifier: "+5511999999999" },
	location: {
		title: "Rua Pardal Branco, 32",
		latitude: -23,
		longitude: -46,
		areaRadius: 2000,
		image: { accessToken: "image-permission" },
	},
	status: "ACTIVE",
	createdAt: "2026-09-22T12:00:00Z",
	updatedAt: "2026-09-22T12:00:00Z",
};

describe("UserJobOutputSchema", () => {
	it("accepts active and archived jobs with full or removed contact", () => {
		expect(UserJobOutputSchema.safeParse(detail).success).toBe(true);
		expect(UserJobOutputSchema.safeParse({ ...detail, status: "ARCHIVED", contact: null }).success).toBe(true);
	});

	it("requires a location title and never exposes a public contact reference", () => {
		expect(
			UserJobOutputSchema.safeParse({
				...detail,
				location: { latitude: -23, longitude: -46, areaRadius: 2000, image: { accessToken: "image-permission" } },
			}).success,
		).toBe(false);
		expect(
			UserJobOutputSchema.safeParse({
				...detail,
				contactReference: { contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
			}).success,
		).toBe(false);
	});

	it("rejects summary-only title, description summary, and payment", () => {
		expect(UserJobOutputSchema.safeParse({ ...detail, title: "Ajudante" }).success).toBe(false);
		expect(UserJobOutputSchema.safeParse({ ...detail, descriptionSummary: "Hoje" }).success).toBe(false);
		expect(UserJobOutputSchema.safeParse({ ...detail, payment: "R$ 100" }).success).toBe(false);
	});
});
