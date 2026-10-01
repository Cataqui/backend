import { GeoimageErrorCode } from "./geoimage-error-code.enum";
import { GeoimageErrorOutputSchema } from "./geoimage-error-output.schema";

const _violation = { path: ["items", 0, "name"], message: "A name is required." };

it("accepts structured validation details and an empty path for body-level errors", () => {
	const output = { errorCode: "VALIDATION_ERROR", violations: [_violation, { path: [], message: "Invalid body." }] };
	expect(GeoimageErrorOutputSchema.parse(output)).toEqual(output);
});

it.each(Object.values(GeoimageErrorCode).filter((code) => code !== GeoimageErrorCode.VALIDATION_ERROR))(
	"keeps %s free of validation details",
	(code) => {
		expect(GeoimageErrorOutputSchema.parse({ errorCode: code })).toEqual({ errorCode: code });
		expect(GeoimageErrorOutputSchema.safeParse({ errorCode: code, violations: [_violation] }).success).toBe(false);
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
	expect(GeoimageErrorOutputSchema.safeParse(output).success).toBe(false);
});
