import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import {
	generateText as aiGenerateText,
	type FlexibleSchema,
	type InferSchema,
	NoObjectGeneratedError,
	Output,
} from "ai";
import { createUnified } from "ai-gateway-provider/providers/unified";
import { runtimeConfig } from "../../core/config/runtime.config";
import { AiTask } from "./ai-task.enum";
import { aiConfig } from "./ai.config";

@Injectable()
export class AiService {
	private readonly _unifiedProvider: ReturnType<typeof createUnified>;

	constructor(
		@Inject(aiConfig.KEY)
		config: ConfigType<typeof aiConfig>,
		@Inject(runtimeConfig.KEY)
		runtime: ConfigType<typeof runtimeConfig>,
	) {
		this._unifiedProvider = createUnified({
			baseURL: `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/v1`,
			headers: {
				Authorization: `Bearer ${config.aiGatewayApiToken}`,
				"cf-aig-gateway-id": config.deriveJobDataAiGatewayId,
				"cf-aig-skip-cache": "true",
				"cf-aig-collect-log": "true",
				"cf-aig-collect-log-payload": runtime.environment === "production" ? "false" : "true",
			},
			supportsStructuredOutputs: true,
		});
	}

	async generateObject<SCHEMA extends FlexibleSchema<unknown>>(params: {
		task: AiTask;
		system: string;
		prompt: string;
		schema: SCHEMA;
		schemaDescription: string;
		maxTokens: number;
		abortSignal: AbortSignal;
	}): Promise<InferSchema<SCHEMA>> {
		const generateObjectOnce = async (): Promise<InferSchema<SCHEMA>> => {
			const { output } = await aiGenerateText({
				model: this._unifiedProvider(this._getGatewayModelForTask({ task: params.task })),
				system: params.system,
				prompt: params.prompt,
				output: Output.object({
					description: params.schemaDescription,
					schema: params.schema,
				}),
				maxOutputTokens: params.maxTokens,
				abortSignal: params.abortSignal,
			});

			return output as InferSchema<SCHEMA>;
		};

		try {
			return await generateObjectOnce();
		} catch (error) {
			if (!NoObjectGeneratedError.isInstance(error)) throw error;

			return generateObjectOnce();
		}
	}

	private _getGatewayModelForTask(params: { task: AiTask }): string {
		switch (params.task) {
			case AiTask.DERIVE_JOB_DATA:
				return "google/gemini-3.5-flash-lite";
		}
	}
}
