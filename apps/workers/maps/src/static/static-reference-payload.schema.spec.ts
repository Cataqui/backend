import { StaticReferencePayloadSchema } from "./static-reference-payload.schema";

const _payload = { version: 1, environment: "staging", center: { latitude: -23.55, longitude: -46.63 } };

describe("static reference payload", () => {
	it("retains only the public fuzzy center and environment", () => {
		expect(StaticReferencePayloadSchema.parse(_payload)).toEqual(_payload);
	});
	it.each(["development", "staging", "production"])("accepts %s scope", (environment) => {
		expect(StaticReferencePayloadSchema.safeParse({ ..._payload, environment: environment }).success).toBe(true);
	});
	it.each([
		{ version: 2 },
		{ environment: "private" },
		{ scene: {} },
		{ exactJobId: "private" },
		{ center: { latitude: 90, longitude: 0 } },
		{ center: { latitude: 0, longitude: 181 } },
	])("rejects unsupported or private payload fields %j", (invalid) => {
		expect(StaticReferencePayloadSchema.safeParse({ ..._payload, ...invalid }).success).toBe(false);
	});
});
