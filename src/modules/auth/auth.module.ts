import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserModule } from "../user/user.module";
import { AuthSessionController } from "./auth-session.controller";
import { authConfig } from "./auth.config";
import { AuthSessionService } from "./auth-session.service";
import { AuthTokenService } from "./auth-token.service";
import { AccessTokenGuard } from "./guards/access-token.guard";
import { InboundMessageAuthController } from "./inbound-message-auth/inbound-message-auth.controller";
import { InboundMessageAuthQueueController } from "./inbound-message-auth/inbound-message-auth.queue.controller";
import { InboundMessageAuthService } from "./inbound-message-auth/inbound-message-auth.service";
import { InboundMessageAuthRepository } from "./inbound-message-auth/repositories/inbound-message-auth.repository";
import { AuthAccessTokenRepository } from "./repositories/auth-access-token.repository";
import { AuthIdentityRepository } from "./repositories/auth-identity.repository";
import { AuthSessionRepository } from "./repositories/auth-session.repository";

@Global()
@Module({
	imports: [ConfigModule.forFeature(authConfig), UserModule],
	controllers: [AuthSessionController, InboundMessageAuthController, InboundMessageAuthQueueController],
	providers: [
		InboundMessageAuthRepository,
		AuthAccessTokenRepository,
		AuthIdentityRepository,
		AuthSessionRepository,
		AuthTokenService,
		InboundMessageAuthService,
		AuthSessionService,
		AccessTokenGuard,
	],
	exports: [AccessTokenGuard, AuthSessionService],
})
export class AuthModule {}
