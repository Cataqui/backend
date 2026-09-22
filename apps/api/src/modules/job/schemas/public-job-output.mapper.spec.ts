import { Prisma, JobStatus } from "../../../../generated/prisma/client.js";
import { toPublicJobOutput } from "./public-job-output.mapper";

describe("toPublicJobOutput", () => {
	it("maps payment text and fuzzy location", () => {
		const result = toPublicJobOutput({
			id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			title: "Ajudante",
			description: "Ajudar",
			descriptionSummary: "Hoje",
			payment: "R$ 100",
			contact: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", contactMethod: "WHATSAPP" },
			fuzzyLatitude: new Prisma.Decimal(-23),
			fuzzyLongitude: new Prisma.Decimal(-46),
			status: JobStatus.ACTIVE,
			createdAt: new Date("2026-09-22T12:00:00Z"),
			updatedAt: new Date("2026-09-22T12:00:00Z"),
		});
		expect(result).toMatchObject({ payment: "R$ 100", location: { latitude: -23, longitude: -46 } });
	});
});
