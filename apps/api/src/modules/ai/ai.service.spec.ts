import { Test } from "@nestjs/testing";
import { vi } from "vitest";
import * as td from "testdouble";
import { z } from "zod";
import { runtimeConfig, type RuntimeConfig } from "../../core/config/runtime.config";
import { AiTask } from "./ai-task.enum";
import { aiConfig, type IAiConfig } from "./ai.config";
import { AiService } from "./ai.service";

const mocks = await vi.hoisted(async () => {
	const td = await import("testdouble");
	return {
		generateText: td.func<typeof import("ai").generateText>(),
		unified: td.func<ReturnType<typeof import("ai-gateway-provider/providers/unified").createUnified>>(),
		createUnified: td.func<typeof import("ai-gateway-provider/providers/unified").createUnified>(),
		outputObject: td.func<typeof import("ai").Output.object>(),
		isInstance: td.func<(error: unknown) => boolean>(),
	};
});

vi.mock("ai", () => ({
	get generateText(): typeof mocks.generateText {
		return mocks.generateText;
	},
	NoObjectGeneratedError: {
		get isInstance(): typeof mocks.isInstance {
			return mocks.isInstance;
		},
	},
	Output: {
		get object(): typeof mocks.outputObject {
			return mocks.outputObject;
		},
	},
}));
vi.mock("ai-gateway-provider/providers/unified", () => ({
	get createUnified(): typeof mocks.createUnified {
		return mocks.createUnified;
	},
}));

afterEach(() => td.reset());

const mockConfig = {
	cloudflareAccountId: "test-account",
	aiGatewayApiToken: "test-token",
	aiGatewayId: "test-gateway",
};

async function _createService(
	params: { environment?: RuntimeConfig["environment"]; config?: IAiConfig } = {},
): Promise<AiService> {
	const module = await Test.createTestingModule({
		providers: [
			AiService,
			{ provide: aiConfig.KEY, useValue: params.config ?? mockConfig },
			{ provide: runtimeConfig.KEY, useValue: { environment: params.environment ?? "development" } },
		],
	}).compile();

	return module.get(AiService);
}

describe("AiService", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	beforeEach(() => {
		mocks.generateText = td.func<typeof import("ai").generateText>();
		mocks.unified = td.func<ReturnType<typeof import("ai-gateway-provider/providers/unified").createUnified>>();
		mocks.createUnified = td.func<typeof import("ai-gateway-provider/providers/unified").createUnified>();
		mocks.outputObject = td.func<typeof import("ai").Output.object>();
		mocks.isInstance = td.func<(error: unknown) => boolean>();
		td.when(mocks.createUnified(td.matchers.anything())).thenReturn(mocks.unified);
		td.when(mocks.unified(td.matchers.anything())).thenReturn(td.object<ReturnType<typeof mocks.unified>>());
		td.when(mocks.outputObject(td.matchers.anything())).thenReturn(td.object<ReturnType<typeof mocks.outputObject>>());
	});

	it("should be defined", async () => {
		const service = await _createService();

		expect(service).toBeDefined();
	});

	it("should use the REST endpoint for Gemini 3.5 Flash Lite and select the API gateway", async () => {
		await _createService({
			config: {
				cloudflareAccountId: "test-account",
				aiGatewayApiToken: "test-token",
				aiGatewayId: "cataqui-api-staging",
			},
		});

		expect(td.explain(mocks.createUnified).calls[0]?.args).toEqual([
			{
				baseURL: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1",
				headers: {
					Authorization: "Bearer test-token",
					"cf-aig-gateway-id": "cataqui-api-staging",
					"cf-aig-collect-log": "true",
					"cf-aig-collect-log-payload": "true",
					"cf-aig-skip-cache": "true",
				},
				supportsStructuredOutputs: true,
			},
		]);
	});

	it.each(["development", "staging"] as const)("should collect full gateway logs in %s", async (environment) => {
		vi.stubEnv("NODE_ENV", "test");
		await _createService({ environment: environment });

		expect(td.explain(mocks.createUnified).calls[0]?.args).toEqual([
			expect.objectContaining({
				headers: expect.objectContaining({
					"cf-aig-collect-log": "true",
					"cf-aig-collect-log-payload": "true",
				}),
			}),
		]);
	});

	it("should keep production gateway payloads private independently of Node execution mode", async () => {
		vi.stubEnv("NODE_ENV", "test");
		await _createService({ environment: "production" });

		expect(td.explain(mocks.createUnified).calls[0]?.args).toEqual([
			expect.objectContaining({
				headers: expect.objectContaining({
					"cf-aig-collect-log": "true",
					"cf-aig-collect-log-payload": "false",
				}),
			}),
		]);
	});

	it("should return a valid structured object", async () => {
		const output = { title: "Auxiliar de cozinha" };
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenResolve({ output: output } satisfies Partial<
			import("ai").GenerateTextResult<Record<string, never>, import("ai").OutputInterface<unknown>>
		>);

		const service = await _createService();

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
		td.when(mocks.isInstance(td.matchers.anything())).thenDo((error: unknown): boolean => error === invalidObjectError);
		let attempts = 0;
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenDo((): Promise<{ output: { title: string } }> | undefined => {
			attempts += 1;
			if (attempts === 1) return Promise.reject(invalidObjectError);
			if (attempts === 2) return Promise.resolve({ output: { title: "Auxiliar de cozinha" } });
			return undefined;
		});

		const service = await _createService();

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(td.explain(mocks.generateText).callCount).toBe(2);
	});

	it("should throw when the structured output retry also fails", async () => {
		const firstInvalidObjectError = new Error("first response did not match schema");
		const secondInvalidObjectError = new Error("second response did not match schema");
		td.when(mocks.isInstance(td.matchers.anything())).thenDo(
			(error: unknown): boolean => error === firstInvalidObjectError || error === secondInvalidObjectError,
		);
		td.when(mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()), {
			times: 2,
		}).thenReject(firstInvalidObjectError, secondInvalidObjectError);

		const service = await _createService();

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
		td.when(mocks.isInstance(td.matchers.anything())).thenReturn(false);
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenReject(new Error("gateway unavailable"));

		const service = await _createService();

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

		expect(td.explain(mocks.generateText).callCount).toBe(1);
	});

	it("should route job data derivation to Gemini 3.5 Flash Lite through Unified Billing", async () => {
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenResolve({ output: {} } satisfies Partial<
			import("ai").GenerateTextResult<Record<string, never>, import("ai").OutputInterface<unknown>>
		>);

		const service = await _createService();

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(td.explain(mocks.unified).calls[0]?.args).toEqual(["google/gemini-3.5-flash-lite"]);
	});

	it("should pass structured output limits to the AI SDK", async () => {
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenResolve({ output: {} } satisfies Partial<
			import("ai").GenerateTextResult<Record<string, never>, import("ai").OutputInterface<unknown>>
		>);

		const service = await _createService();
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

		expect(td.explain(mocks.generateText).calls[0]?.args).toEqual([
			expect.objectContaining({
				maxOutputTokens: 512,
				abortSignal: abortController.signal,
			}),
		]);
	});

	it("should use the AI SDK default retry policy", async () => {
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenResolve({ output: {} } satisfies Partial<
			import("ai").GenerateTextResult<Record<string, never>, import("ai").OutputInterface<unknown>>
		>);

		const service = await _createService();

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 512,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(td.explain(mocks.generateText).calls[0]?.args[0]).not.toHaveProperty("maxRetries");
	});

	it("should omit sampling parameters from structured output requests", async () => {
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenResolve({ output: { title: "Montador de móveis" } } satisfies Partial<
			import("ai").GenerateTextResult<Record<string, never>, import("ai").OutputInterface<unknown>>
		>);

		const service = await _createService();

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(td.explain(mocks.generateText).calls[0]?.args[0]).not.toHaveProperty("temperature");
	});

	it("should rely on the JSON Schema without sending a provider-specific schema name", async () => {
		td.when(
			mocks.generateText<Record<string, never>, import("ai").OutputInterface<unknown>>(td.matchers.anything()),
		).thenResolve({ output: { title: "Montador de móveis" } } satisfies Partial<
			import("ai").GenerateTextResult<Record<string, never>, import("ai").OutputInterface<unknown>>
		>);

		const service = await _createService();

		await service.generateObject({
			task: AiTask.DERIVE_JOB_DATA,
			system: "system",
			prompt: "prompt",
			schema: z.object({ title: z.string() }),
			schemaDescription: "description",
			maxTokens: 128,
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(td.explain(mocks.outputObject).calls[0]?.args[0]).not.toHaveProperty("name");
	});
});
