import { Module } from "@nestjs/common";
import { aiConfig } from "./ai.config";
import { AiService } from "./ai.service";

@Module({
	providers: [
		{
			provide: aiConfig.KEY,
			useFactory: aiConfig,
		},
		AiService,
	],
	exports: [AiService],
})
export class AiModule {}
