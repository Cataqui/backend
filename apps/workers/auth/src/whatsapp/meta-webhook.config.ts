import { instancePerContainerCachingFactory, registry } from "tsyringe";
import { AuthEnvironment } from "../environment.config";

export const MetaWebhookConfig = Symbol("MetaWebhookConfig");
export interface MetaWebhookConfig {
	appSecret: string;
	verificationToken: string;
}

@registry([
	{
		token: MetaWebhookConfig,
		useFactory: instancePerContainerCachingFactory<MetaWebhookConfig>((container) => {
			const environment = container.resolve<AuthEnvironment>(AuthEnvironment);
			return {
				appSecret: environment.META_APP_SECRET,
				verificationToken: environment.WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN,
			};
		}),
	},
])
export class MetaWebhookConfigRegistry {}
