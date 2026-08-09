import { requestSizeConfig } from "./request-size.config";

describe("requestSizeConfig", () => {
	it("should disable the socket timeout and allow AI handlers up to sixty seconds", () => {
		const config = requestSizeConfig();

		expect({ connectionTimeoutMs: config.connectionTimeoutMs, handlerTimeoutMs: config.handlerTimeoutMs }).toEqual({
			connectionTimeoutMs: 0,
			handlerTimeoutMs: 60_000,
		});
	});
});
