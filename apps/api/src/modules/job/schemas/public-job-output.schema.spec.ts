import { PublicJobOutputSchema } from "./public-job-output.schema";
const job = {
	jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: "Ajudante",
	description: "Ajudar a carregar caixas",
	descriptionSummary: "Hoje à tarde",
	contactReference: { contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", contactMethod: "WHATSAPP" },
	location: { latitude: -23, longitude: -46, areaRadius: 2000 },
	payment: "R$ 100",
	status: "ACTIVE",
	createdAt: "2026-09-22T12:00:00Z",
	updatedAt: "2026-09-22T12:00:00Z",
};
describe("PublicJobOutputSchema", () => {
	it("accepts a job with payment text and no job type", () => {
		expect(PublicJobOutputSchema.safeParse(job).success).toBe(true);
	});
	it("rejects structured payment and obsolete job type", () => {
		expect(PublicJobOutputSchema.safeParse({ ...job, payment: { type: "FIXED" } }).success).toBe(false);
		expect(PublicJobOutputSchema.safeParse({ ...job, type: "INDIVIDUAL" }).success).toBe(false);
	});
});
