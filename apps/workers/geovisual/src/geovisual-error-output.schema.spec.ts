import { GeovisualErrorCode } from "./geovisual-error-code.enum";
import { GeovisualErrorOutputSchema } from "./geovisual-error-output.schema";

const _violation = { path: ["items", 0, "name"], message: "A name is required." };

it("accepts structured validation details and an empty path for body-level errors", () => {
	const output = { errorCode: "VALIDATION_ERROR", violations: [_violation, { path: [], message: "Invalid body." }] };
	expect(GeovisualErrorOutputSchema.parse(output)).toEqual(output);
});

it.each(Object.values(GeovisualErrorCode).filter((code) => code !== GeovisualErrorCode.VALIDATION_ERROR))(
	"keeps %s free of validation details",
	(code) => {
		expect(GeovisualErrorOutputSchema.parse({ errorCode: code })).toEqual({ errorCode: code });
		expect(GeovisualErrorOutputSchema.safeParse({ errorCode: code, violations: [_violation] }).success).toBe(false);
	},
);

it.each([
	{ errorCode: "VALIDATION_ERROR" },
	{ errorCode: "VALIDATION_ERROR", violations: [] },
	{ errorCode: "VALIDATION_ERROR", violations: [{ ..._violation, path: [-1] }] },
	{ errorCode: "VALIDATION_ERROR", violations: [{ ..._violation, message: "" }] },
	{ errorCode: "VALIDATION_ERROR", violations: [{ ..._violation, received: "private" }] },
	{ errorCode: "VALIDATION_ERROR", violations: [{ ..._violation, path: [true] }] },
	{ errorCode: "VALIDATION_ERROR", violations: [_violation], stack: "private" },
])("rejects an invalid validation error contract %j", (output) => {
	expect(GeovisualErrorOutputSchema.safeParse(output).success).toBe(false);
});
