import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthSessionController } from "./auth-session.controller";
import { authConfig } from "./auth.config";
import { AuthSessionService } from "./auth-session.service";
import { AuthTokenService } from "./auth-token.service";
import { AccessTokenGuard } from "./guards/access-token.guard";
import { InboundMessageAuthController } from "./inbound-message-auth/inbound-message-auth.controller";
import { InboundMessageAuthInboundController } from "./inbound-message-auth/inbound-message-auth.inbound.controller";
import { inboundMessageAuthConfig } from "./inbound-message-auth/inbound-message-auth.config";
import { InboundMessageAuthService } from "./inbound-message-auth/inbound-message-auth.service";
import { microservicesAuthConfig } from "./microservices-auth/microservices-auth.config";
import { MicroservicesAuthController } from "./microservices-auth/microservices-auth.controller";
import { MicroservicesAuthService } from "./microservices-auth/microservices-auth.service";
import { InboundMessageAuthRepository } from "./inbound-message-auth/repositories/inbound-message-auth.repository";
import { AuthAccessTokenRepository } from "./repositories/auth-access-token.repository";
import { AuthIdentityRepository } from "./repositories/auth-identity.repository";
import { AuthSessionRepository } from "./repositories/auth-session.repository";

@Global()
@Module({
	imports: [
		ConfigModule.forFeature(authConfig),
		ConfigModule.forFeature(inboundMessageAuthConfig),
		ConfigModule.forFeature(microservicesAuthConfig),
	],
	controllers: [
		AuthSessionController,
		InboundMessageAuthController,
		InboundMessageAuthInboundController,
		MicroservicesAuthController,
	],
	providers: [
		InboundMessageAuthRepository,
		AuthAccessTokenRepository,
		AuthIdentityRepository,
		AuthSessionRepository,
		AuthTokenService,
		InboundMessageAuthService,
		AuthSessionService,
		MicroservicesAuthService,
		AccessTokenGuard,
	],
	exports: [AccessTokenGuard, AuthSessionService],
})
export class AuthModule {}
