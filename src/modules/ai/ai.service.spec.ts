import { Test } from "@nestjs/testing";
import { vi } from "vitest";
import { z } from "zod";
import { AiTask } from "./ai-task.enum";
import { aiConfig } from "./ai.config";
import { AiService } from "./ai.service";

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGatewayFn = vi.hoisted(() => vi.fn(() => ({})));
const mockUnifiedFn = vi.hoisted(() => vi.fn((model: string) => model));
const mockCreateAiGateway = vi.hoisted(() => vi.fn(() => mockGatewayFn));
const mockCreateUnified = vi.hoisted(() => vi.fn(() => mockUnifiedFn));
const mockOutputObject = vi.hoisted(() => vi.fn((params: unknown) => params));
const mockNoObjectGeneratedErrorIsInstance = vi.hoisted(() => vi.fn<(error: unknown) => boolean>(() => false));

vi.mock("ai", () => ({
	generateText: mockGenerateText,
	NoObjectGeneratedError: {
		isInstance: mockNoObjectGeneratedErrorIsInstance,
	},
	Output: {
		object: mockOutputObject,
	},
}));

vi.mock("ai-gateway-provider", () => ({
	createAiGateway: mockCreateAiGateway,
}));

vi.mock("ai-gateway-provider/providers/unified", () => ({
	createUnified: mockCreateUnified,
}));

const mockConfig = {
	cloudflareAccountId: "test-account",
	aiApiToken: "test-token",
	cloudflareAiGatewayId: "test-gateway",
};

describe("AiService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGenerateText.mockReset();
		mockNoObjectGeneratedErrorIsInstance.mockReset().mockReturnValue(false);
	});

	it("should be defined", async () => {
		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();

		const service = module.get(AiService);

		expect(service).toBeDefined();
	});

	it("should configure the unified provider for native structured outputs", async () => {
		await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();

		expect(mockCreateUnified).toHaveBeenCalledWith({ supportsStructuredOutputs: true });
	});

	it("should configure a no-cache and no-log gateway for sensitive structured data", async () => {
		await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();

		expect(mockCreateAiGateway).toHaveBeenCalledWith({
			accountId: "test-account",
			gateway: "test-gateway",
			apiKey: "test-token",
			options: {
				collectLog: false,
				skipCache: true,
			},
		});
	});

	it("should return a valid structured object", async () => {
		const output = { title: "Auxiliar de cozinha" };
		mockGenerateText.mockResolvedValue({ output: output });

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		const result = await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(result).toBe(output);
	});

	it("should retry once when the first response cannot produce a valid structured object", async () => {
		const invalidObjectError = new Error("response did not match schema");
		mockNoObjectGeneratedErrorIsInstance.mockImplementation((error: unknown) => error === invalidObjectError);
		mockGenerateText
			.mockRejectedValueOnce(invalidObjectError)
			.mockResolvedValueOnce({ output: { title: "Auxiliar de cozinha" } });

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(mockGenerateText).toHaveBeenCalledTimes(2);
	});

	it("should throw when the structured output retry also fails", async () => {
		const firstInvalidObjectError = new Error("first response did not match schema");
		const secondInvalidObjectError = new Error("second response did not match schema");
		mockNoObjectGeneratedErrorIsInstance.mockImplementation(
			(error: unknown) => error === firstInvalidObjectError || error === secondInvalidObjectError,
		);
		mockGenerateText.mockRejectedValueOnce(firstInvalidObjectError).mockRejectedValueOnce(secondInvalidObjectError);

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		await expect(
			service.generateObject({
				task: AiTask.DERIVE_JOB_DATA,
				system: "system",
				prompt: "prompt",
				schema: z.object({ title: z.string() }),
				schemaDescription: "description",
				maxTokens: 128,
				abortSignal: AbortSignal.timeout(30_000),
			}),
		).rejects.toBe(secondInvalidObjectError);
	});

	it("should not retry errors unrelated to structured output generation", async () => {
		mockGenerateText.mockRejectedValue(new Error("gateway unavailable"));

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		await service
			.generateObject({
				task: AiTask.DERIVE_JOB_DATA,
				system: "system",
				prompt: "prompt",
				schema: z.object({ title: z.string() }),
				schemaDescription: "description",
				maxTokens: 128,
				abortSignal: AbortSignal.timeout(30_000),
			})
			.catch(() => undefined);

		expect(mockGenerateText).toHaveBeenCalledOnce();
	});

	it("should route job data derivation to Gemini 3.5 Flash Lite through Cloudflare", async () => {
		mockGenerateText.mockResolvedValue({ output: {} });

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(mockUnifiedFn).toHaveBeenCalledWith("google-vertex-ai/google/gemini-3.5-flash-lite");
	});

	it("should pass structured output limits to the AI SDK", async () => {
		mockGenerateText.mockResolvedValue({ output: {} });

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);
		const abortController = new AbortController();
		const schema = z.object({ title: z.string() });

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: schema,
			schemaDescription: "description",
			maxTokens: 512,
			abortSignal: abortController.signal,
		});

		expect(mockGenerateText).toHaveBeenCalledWith(
			expect.objectContaining({
				maxOutputTokens: 512,
				abortSignal: abortController.signal,
			}),
		);
	});

	it("should use the AI SDK default retry policy", async () => {
		mockGenerateText.mockResolvedValue({ output: {} });

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 512,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(mockGenerateText.mock.calls[0]?.[0]).not.toHaveProperty("maxRetries");
	});

	it("should omit sampling parameters from structured output requests", async () => {
		mockGenerateText.mockResolvedValue({ output: { title: "Montador de móveis" } });

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(mockGenerateText.mock.calls[0]?.[0]).not.toHaveProperty("temperature");
	});

	it("should rely on the JSON Schema without sending a provider-specific schema name", async () => {
		mockGenerateText.mockResolvedValue({ output: { title: "Montador de móveis" } });

		const module = await Test.createTestingModule({
			providers: [AiService, { provide: aiConfig.KEY, useValue: mockConfig }],
		}).compile();
		const service = module.get(AiService);

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(mockOutputObject.mock.calls[0]?.[0]).not.toHaveProperty("name");
	});
});
