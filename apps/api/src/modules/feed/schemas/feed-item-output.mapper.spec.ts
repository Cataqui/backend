import { toFeedItemOutput } from "./feed-item-output.mapper";

describe("toFeedItemOutput", () => {
	it("returns payment text unchanged", () => {
		const result = toFeedItemOutput({
			job: {
				id: "job",
				title: "Ajudante",
				createdAt: new Date("2026-09-22T12:00:00Z"),
				descriptionSummary: "Hoje",
				payment: "A combinar",
				fuzzyLatitude: -23,
				fuzzyLongitude: -46,
			},
		});
		expect(result.payment).toBe("A combinar");
	});

	it("returns null payment unchanged", () => {
		const result = toFeedItemOutput({
			job: {
				id: "job",
				title: "Ajudante",
				createdAt: new Date("2026-09-22T12:00:00Z"),
				descriptionSummary: "Hoje",
				payment: null,
				fuzzyLatitude: -23,
				fuzzyLongitude: -46,
			},
		});
		expect(result.payment).toBeNull();
	});
});
