import { ObjectUtils } from "./object.utils";

describe("ObjectUtils", () => {
	describe("filterUndefined", () => {
		it("should remove undefined values", () => {
			const result = ObjectUtils.filterUndefined({ a: 1, b: undefined, c: 3 });
			expect(result).toEqual({ a: 1, c: 3 });
		});

		it("should keep null values", () => {
			const result = ObjectUtils.filterUndefined({ a: null, b: 1 });
			expect(result).toEqual({ a: null, b: 1 });
		});

		it("should keep zero values", () => {
			const result = ObjectUtils.filterUndefined({ a: 0, b: 1 });
			expect(result).toEqual({ a: 0, b: 1 });
		});

		it("should keep false values", () => {
			const result = ObjectUtils.filterUndefined({ a: false, b: true });
			expect(result).toEqual({ a: false, b: true });
		});

		it("should keep empty strings", () => {
			const result = ObjectUtils.filterUndefined({ a: "", b: "hello" });
			expect(result).toEqual({ a: "", b: "hello" });
		});

		it("should handle empty object", () => {
			const result = ObjectUtils.filterUndefined({});
			expect(result).toEqual({});
		});

		it("should handle object with all undefined values", () => {
			const result = ObjectUtils.filterUndefined({ a: undefined, b: undefined });
			expect(result).toEqual({});
		});

		it("should return a partial type", () => {
			const input = { name: "test", age: undefined };
			const result = ObjectUtils.filterUndefined(input);
			expect(result).toEqual({ name: "test" });
			expect(Object.keys(result)).not.toContain("age");
		});
	});
});
