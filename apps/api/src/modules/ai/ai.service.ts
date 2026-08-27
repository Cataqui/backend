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
import { ObservabilityOperationName } from "../../core/observability/observability-operation-name.enum";
import { ObservabilityService } from "../../core/observability/observability.service";
import { AiTask } from "./ai-task.enum";
import { aiConfig, type IAiConfig } from "./ai.config";

function _getGatewayLoggingHeaders(params: { environment: IAiConfig["environment"] }): Record<string, string> {
	switch (params.environment) {
		case "development":
		case "staging":
			return {
				"cf-aig-collect-log": "true",
				"cf-aig-collect-log-payload": "true",
			};
		case "production":
			return {
				"cf-aig-collect-log": "true",
				"cf-aig-collect-log-payload": "false",
			};
		case "test":
			return { "cf-aig-collect-log": "false" };
	}
}

@Injectable()
export class AiService {
	private readonly _unifiedProvider: ReturnType<typeof createUnified>;

	constructor(
		@Inject(aiConfig.KEY)
		config: ConfigType<typeof aiConfig>,
		private readonly _observabilityService: ObservabilityService,
	) {
		this._unifiedProvider = createUnified({
			baseURL: `https://gateway.ai.cloudflare.com/v1/${config.cloudflareAccountId}/${config.deriveJobDataAiGatewayId}/compat`,
			headers: {
				"cf-aig-authorization": `Bearer ${config.aiGatewayApiToken}`,
				"cf-aig-skip-cache": "true",
				..._getGatewayLoggingHeaders({ environment: config.environment }),
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

		const generateObjectWithStructuredOutputRetry = async (): Promise<InferSchema<SCHEMA>> => {
			try {
				return await generateObjectOnce();
			} catch (error) {
				if (!NoObjectGeneratedError.isInstance(error)) throw error;

				return generateObjectOnce();
			}
		};

		return this._observabilityService.observeOperation({
			operation: generateObjectWithStructuredOutputRetry,
			operationName: this._getObservabilityOperationNameForTask({ task: params.task }),
		});
	}

	private _getObservabilityOperationNameForTask(params: { task: AiTask }): ObservabilityOperationName {
		switch (params.task) {
			case AiTask.DERIVE_JOB_DATA:
				return ObservabilityOperationName.AI_DERIVE_JOB_DATA;
		}
	}

	private _getGatewayModelForTask(params: { task: AiTask }): string {
		switch (params.task) {
			case AiTask.DERIVE_JOB_DATA:
				return "google-vertex-ai/google/gemini-3.5-flash-lite";
		}
	}
}
