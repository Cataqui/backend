import { Test } from "@nestjs/testing";
import { AiGatewayService } from "./ai-gateway-service";
import { AI_CONFIG_KEY } from "./ai.config";
import { AiGatewayJobTypeModel } from "./ai-gateway-job-type-model";
import { vi } from "vitest";

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGatewayFn = vi.hoisted(() => vi.fn(() => ({})));
const mockUnifiedFn = vi.hoisted(() => vi.fn((model: string) => model));

vi.mock("ai", () => ({
	generateText: mockGenerateText,
}));

vi.mock("ai-gateway-provider", () => ({
	createAiGateway: vi.fn(() => mockGatewayFn),
}));

vi.mock("ai-gateway-provider/providers/unified", () => ({
	createUnified: vi.fn(() => mockUnifiedFn),
}));

const mockConfig = {
	cloudflareAccountId: "test-account",
	aiApiToken: "test-token",
	cloudflareAiGatewayId: "test-gateway",
};

describe("AiGatewayService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should be defined", async () => {
		const module = await Test.createTestingModule({
			providers: [AiGatewayService, { provide: AI_CONFIG_KEY, useValue: mockConfig }],
		}).compile();

		const service = module.get(AiGatewayService);

		expect(service).toBeDefined();
	});

	it("should call ai generateText with system and prompt and return trimmed text", async () => {
		mockGenerateText.mockResolvedValue({ text: "  Test summary  " });

		const module = await Test.createTestingModule({
			providers: [AiGatewayService, { provide: AI_CONFIG_KEY, useValue: mockConfig }],
		}).compile();

		const service = module.get(AiGatewayService);
		const result = await service.generateText({
			jobType: AiGatewayJobTypeModel.SUMMARIZE,
			system: "system prompt",
			prompt: "user prompt",
			temperature: 0,
		});

		expect(mockGenerateText).toHaveBeenCalledWith({
			model: {},
			system: "system prompt",
			prompt: "user prompt",
			temperature: 0,
		});
		expect(result).toBe("Test summary");
	});

	it("should use the correct model for each job type", async () => {
		const module = await Test.createTestingModule({
			providers: [AiGatewayService, { provide: AI_CONFIG_KEY, useValue: mockConfig }],
		}).compile();

		const service = module.get(AiGatewayService);
		await service.generateText({
			jobType: AiGatewayJobTypeModel.SUMMARIZE,
			system: "test system",
			prompt: "test prompt",
			temperature: 0,
		});

		expect(mockUnifiedFn).toHaveBeenCalledWith(AiGatewayJobTypeModel.SUMMARIZE);
	});

	it("should propagate api errors", async () => {
		mockGenerateText.mockRejectedValue(new Error("API error"));

		const module = await Test.createTestingModule({
			providers: [AiGatewayService, { provide: AI_CONFIG_KEY, useValue: mockConfig }],
		}).compile();

		const service = module.get(AiGatewayService);

		await expect(
			service.generateText({
				jobType: AiGatewayJobTypeModel.SUMMARIZE,
				system: "test system",
				prompt: "test prompt",
				temperature: 0,
			}),
		).rejects.toThrow("API error");
	});
});
