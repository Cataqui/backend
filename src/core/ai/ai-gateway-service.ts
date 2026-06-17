import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { generateText as aiGenerateText } from "ai";
import { type AiGateway, createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";
import { AI_CONFIG_KEY, aiConfig } from "./ai.config";
import { AiGatewayJobTypeModel } from "./ai-gateway-job-type-model";

@Injectable()
export class AiGatewayService {
	private readonly _gateway: AiGateway;
	private readonly _unified: ReturnType<typeof createUnified>;

	constructor(
		@Inject(AI_CONFIG_KEY)
		config: ConfigType<typeof aiConfig>,
	) {
		this._gateway = createAiGateway({
			accountId: config.cloudflareAccountId,
			gateway: config.cloudflareAiGatewayId,
			apiKey: config.aiApiToken,
		});
		this._unified = createUnified();
	}

	async generateText(params: {
		jobType: AiGatewayJobTypeModel;
		system: string;
		prompt: string;
		temperature: number;
	}): Promise<string> {
		const { text } = await aiGenerateText({
			model: this._gateway(this._unified(params.jobType)),
			system: params.system,
			prompt: params.prompt,
			temperature: params.temperature,
		});

		return text.trim();
	}
}
