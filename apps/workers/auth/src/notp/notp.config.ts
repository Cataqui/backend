import { instancePerContainerCachingFactory, registry } from "tsyringe";
import { AuthEnvironment } from "../environment.config";

export const NotpConfig = Symbol("NotpConfig");
export interface NotpConfig {
	whatsappPhoneNumber: string;
	whatsappPhoneNumberId: string;
}

@registry([
	{
		token: NotpConfig,
		useFactory: instancePerContainerCachingFactory<NotpConfig>((container) => {
			const environment = container.resolve<AuthEnvironment>(AuthEnvironment);
			return {
				whatsappPhoneNumber: environment.WHATSAPP_NOTP_RECEIVER,
				whatsappPhoneNumberId: environment.WHATSAPP_NOTP_PHONE_NUMBER_ID,
			};
		}),
	},
])
export class NotpConfigRegistry {}
