import { CurrentUserOutputSchema } from "./current-user-output.schema";

describe("CurrentUserOutputSchema", () => {
	it("should return the supported current user fields without exposing the provider subject", () => {
		const output = {
			userId: "f3f3f078-9332-4879-9904-6565abc5d88d",
			displayIdentifier: "Ana Silva",
		};

		expect(CurrentUserOutputSchema.parse(output)).toEqual(output);
	});
});
