import { UserJobOutputSchema } from "./user-job-output.schema";

describe("UserJobOutputSchema", () => {
	it("requires a fuzzy location for every posted job", () => {
		const postedJob = {
			jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			title: "Descarregar caixas",
			descriptionSummary: "Trabalho de um dia",
			payment: "R$ 150",
			location: { latitude: -23.55, longitude: -46.63, areaRadius: 2_000 },
			status: "ACTIVE",
			createdAt: "2026-09-22T12:00:00.000Z",
			updatedAt: "2026-09-22T12:00:00.000Z",
		};
		expect(UserJobOutputSchema.safeParse(postedJob).success).toBe(true);
		expect(UserJobOutputSchema.safeParse({ ...postedJob, location: null }).success).toBe(false);
	});
});
