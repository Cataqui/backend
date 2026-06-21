import { AiGatewayJobTypeModel } from "./ai-gateway-job-type-model";

describe("AiGatewayJobTypeModel", () => {
	it("should have SUMMARIZE with the GLM-4.7 Flash model string", () => {
		expect(AiGatewayJobTypeModel.SUMMARIZE).toBe("workers-ai/@cf/zai-org/glm-4.7-flash");
	});
});
