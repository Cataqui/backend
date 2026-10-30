import * as td from "testdouble";
import type { AiWorkerEnv } from "../../cloudflare.config.ts";
import { InferenceRepository } from "./inference.repository";

afterEach(() => td.reset());

it.each([
	{ content: '{"givenName":"Sophia","meaning":"wisdom"}', finishReason: "stop" },
	{ content: "partial", finishReason: "length" },
	{ content: null, finishReason: "content_filter" },
] as const)("maps the first completion to the owned result: $finishReason", async (expected) => {
	const env = {
		ENVIRONMENT: "staging",
		AI_GATEWAY_ID: "cataqui-ai-worker-staging",
		AI: td.object<AiWorkerEnv["AI"]>(),
		AUTH: td.object<AiWorkerEnv["AUTH"]>(),
		NAME_ANALYSIS_RATE_LIMITER: td.object<AiWorkerEnv["NAME_ANALYSIS_RATE_LIMITER"]>(),
	} satisfies AiWorkerEnv;
	const response = {
		id: "completion-id",
		object: "chat.completion",
		created: 1,
		model: "@cf/zai-org/glm-5.2",
		choices: [
			{
				index: 0,
				finish_reason: expected.finishReason,
				logprobs: null,
				message: { role: "assistant", content: expected.content, refusal: null },
			},
			{
				index: 1,
				finish_reason: "stop",
				logprobs: null,
				message: { role: "assistant", content: "another completion", refusal: null },
			},
		],
	} satisfies ChatCompletionsOutput;
	const input: AiModels["@cf/zai-org/glm-5.2"]["inputs"] & { stream: false } = td.matchers.anything();
	td.when(
		env.AI.run("@cf/zai-org/glm-5.2", input, {
			gateway: { id: env.AI_GATEWAY_ID },
			signal: td.matchers.anything(),
		}),
	).thenResolve(response);
	const repository = new InferenceRepository(env);
	await expect(
		repository.inferNameAnalysis({ name: "Arthur", language: "en", signal: new AbortController().signal }),
	).resolves.toEqual(expected);
});
