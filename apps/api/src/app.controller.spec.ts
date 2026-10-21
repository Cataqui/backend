import { Test } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { EnvSchema } from "./core/config/env.schema";
import { runtimeConfig } from "./core/config/runtime.config";

describe("AppController", () => {
	it.each(EnvSchema.shape.ENVIRONMENT.options)(
		"should return running status and the %s deployment environment",
		async (environment) => {
			const module = await Test.createTestingModule({
				controllers: [AppController],
				providers: [{ provide: runtimeConfig.KEY, useValue: { environment: environment } }],
			}).compile();
			const result = module.get(AppController).root();
			await module.close();

			expect(result).toEqual({
				status: "ok",
				message: "Cataquí API server is running...",
				environment: environment,
			});
		},
	);
});
