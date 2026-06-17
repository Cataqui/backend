import { AiGatewayJobTypeModel } from "./ai-gateway-job-type-model";

describe("AiGatewayJobTypeModel", () => {
	it("should have SUMMARIZE with the Granite 4.0 model string", () => {
		expect(AiGatewayJobTypeModel.SUMMARIZE).toBe("workers-ai/@cf/ibm-granite/granite-4.0-h-micro");
	});
});
