import { AiGatewayJobTypeModel } from "./ai-gateway-job-type-model";

describe("AiGatewayJobTypeModel", () => {
	it("should have SUMMARIZE with the Llama 3.1 8B fast model string", () => {
		expect(AiGatewayJobTypeModel.SUMMARIZE).toBe("workers-ai/@cf/meta/llama-3.1-8b-instruct-fast");
	});
});
