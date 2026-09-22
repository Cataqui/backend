import { CreateJobInputSchema } from "./create-job-input.schema";

const valid = {
	description: "Preciso de ajuda para descarregar caixas.",
	payment: "R$ 100",
	location: { latitude: -23, longitude: -46 },
	contact: { contactMethod: "WHATSAPP", identifier: "+5511999999999" },
};

describe("CreateJobInputSchema", () => {
	it("accepts a complete social post", () => {
		expect(CreateJobInputSchema.safeParse(valid).success).toBe(true);
	});
	it.each([
		{ payment: " " },
		{ payment: "x".repeat(31) },
		{ location: undefined },
		{ contact: undefined },
		{ description: "short" },
		{ type: "INDIVIDUAL" },
	])("rejects an incomplete or obsolete post field: %j", (change) => {
		expect(CreateJobInputSchema.safeParse({ ...valid, ...change }).success).toBe(false);
	});
});
