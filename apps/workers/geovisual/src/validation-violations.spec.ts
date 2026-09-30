import { toValidationViolations } from "./validation-violations";

it("normalizes property names, array indexes, wrapped segments, and body-wide validation issues", () => {
	const issues = [
		{ path: ["items", { key: 2 }, { key: "name" }], message: "A name is required.", received: "private" },
		{ path: [0, Symbol.for("property")], message: "Invalid property." },
		{ message: "An object is required." },
	];
	expect(toValidationViolations({ issues: issues })).toEqual([
		{ path: ["items", 2, "name"], message: "A name is required." },
		{ path: [0, "Symbol(property)"], message: "Invalid property." },
		{ path: [], message: "An object is required." },
	]);
});
