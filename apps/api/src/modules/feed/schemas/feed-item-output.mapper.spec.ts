import { toFeedItemOutput } from "./feed-item-output.mapper";

describe("toFeedItemOutput", () => {
	it("returns payment text unchanged", () => {
		const result = toFeedItemOutput({
			location: { latitude: -23, longitude: -46, areaRadius: 2000, image: { accessToken: "image-permission" } },
			job: {
				id: "job",
				title: "Ajudante",
				createdAt: new Date("2026-09-22T12:00:00Z"),
				descriptionSummary: "Hoje",
				payment: "A combinar",
			},
		});
		expect(result.payment).toBe("A combinar");
	});

	it("returns null payment unchanged", () => {
		const result = toFeedItemOutput({
			location: { latitude: -23, longitude: -46, areaRadius: 2000, image: { accessToken: "image-permission" } },
			job: {
				id: "job",
				title: "Ajudante",
				createdAt: new Date("2026-09-22T12:00:00Z"),
				descriptionSummary: "Hoje",
				payment: null,
			},
		});
		expect(result.payment).toBeNull();
	});
	it("uses the completed fuzzy location supplied by the caller", () => {
		const location = { latitude: -10, longitude: -20, areaRadius: 1500, image: { accessToken: "supplied-permission" } };
		expect(
			toFeedItemOutput({
				job: {
					id: "job",
					title: "Ajudante",
					createdAt: new Date("2026-09-22T12:00:00Z"),
					descriptionSummary: "Hoje",
					payment: null,
				},
				location: location,
			}).location,
		).toBe(location);
	});
});
