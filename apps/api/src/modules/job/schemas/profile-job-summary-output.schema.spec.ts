import { ProfileJobSummaryOutputSchema } from "./profile-job-summary-output.schema";

describe("ProfileJobSummaryOutputSchema", () => {
	it("accepts a posted job with a fuzzy location", () => {
		const postedJob = {
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			title: "Descarregar caixas",
			descriptionSummary: "Trabalho de um dia",
			payment: "R$ 150",
			location: {
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2_000,
				imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
			},
			status: "ACTIVE",
			createdAt: "2026-09-22T12:00:00.000Z",
			updatedAt: "2026-09-22T12:00:00.000Z",
		};
		expect(ProfileJobSummaryOutputSchema.safeParse(postedJob).success).toBe(true);
	});

	it("rejects a posted job without a fuzzy location", () => {
		const postedJob = {
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			title: "Descarregar caixas",
			descriptionSummary: "Trabalho de um dia",
			payment: "R$ 150",
			location: {
				latitude: -23.55,
				longitude: -46.63,
				areaRadius: 2_000,
				imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
			},
			status: "ACTIVE",
			createdAt: "2026-09-22T12:00:00.000Z",
			updatedAt: "2026-09-22T12:00:00.000Z",
		};

		expect(ProfileJobSummaryOutputSchema.safeParse({ ...postedJob, location: null }).success).toBe(false);
	});
});
