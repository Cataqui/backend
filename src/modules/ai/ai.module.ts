import { Module } from "@nestjs/common";
import { AI_CONFIG_KEY, aiConfig } from "./ai.config";
import { AiService } from "./ai.service";

@Module({
	providers: [
		{
			provide: AI_CONFIG_KEY,
			useFactory: aiConfig,
		},
		AiService,
	],
	exports: [AiService],
})
export class AiModule {}
