import { AiGatewayJobTypeModel } from "./ai-gateway-job-type-model";

describe("AiGatewayJobTypeModel", () => {
	it("should have SUMMARIZE with the Qwen3 30B A3B FP8 model string", () => {
		expect(AiGatewayJobTypeModel.SUMMARIZE).toBe("workers-ai/@cf/qwen/qwen3-30b-a3b-fp8");
	});
});
