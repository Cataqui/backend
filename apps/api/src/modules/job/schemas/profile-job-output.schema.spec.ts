import { ProfileJobOutputSchema } from "./profile-job-output.schema";

const detail = {
	jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	description: "Ajudar a carregar caixas",
	contact: { method: "WHATSAPP", identifier: "+5511999999999" },
	location: {
		title: "Rua Pardal Branco, 32",
		latitude: -23,
		longitude: -46,
		areaRadius: 2000,
		imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
	},
	status: "ACTIVE",
	createdAt: "2026-09-22T12:00:00Z",
	updatedAt: "2026-09-22T12:00:00Z",
};

describe("ProfileJobOutputSchema", () => {
	it("accepts an active job with its full contact", () => {
		expect(ProfileJobOutputSchema.safeParse(detail).success).toBe(true);
	});

	it("accepts an archived job after its contact is removed", () => {
		expect(ProfileJobOutputSchema.safeParse({ ...detail, status: "ARCHIVED", contact: null }).success).toBe(true);
	});

	it("requires a location title", () => {
		expect(
			ProfileJobOutputSchema.safeParse({
				...detail,
				location: {
					latitude: -23,
					longitude: -46,
					areaRadius: 2000,
					imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
				},
			}).success,
		).toBe(false);
	});

	it("never exposes a public contact reference", () => {
		expect(
			ProfileJobOutputSchema.safeParse({
				...detail,
				contactReference: { contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
			}).success,
		).toBe(false);
	});

	it("rejects the summary-only title", () => {
		expect(ProfileJobOutputSchema.safeParse({ ...detail, title: "Ajudante" }).success).toBe(false);
	});

	it("rejects the summary-only description summary", () => {
		expect(ProfileJobOutputSchema.safeParse({ ...detail, descriptionSummary: "Hoje" }).success).toBe(false);
	});

	it("rejects the summary-only payment", () => {
		expect(ProfileJobOutputSchema.safeParse({ ...detail, payment: "R$ 100" }).success).toBe(false);
	});
});
