import { MapAuthConstants } from "./map-auth.constants";

describe("MapAuthConstants", () => {
	it("should have AUTH_VERSION_PARAM set to 1", () => {
		expect(MapAuthConstants.AUTH_VERSION_PARAM).toBe("1");
	});

	it("should have AUTH_MESSAGE_PREFIX set to v1", () => {
		expect(MapAuthConstants.AUTH_MESSAGE_PREFIX).toBe("v1");
	});

	it("should have AUTH_EXPIRATION_SECONDS set to 3600", () => {
		expect(MapAuthConstants.AUTH_EXPIRATION_SECONDS).toBe(3600);
	});
});
