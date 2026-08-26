import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthSessionController } from "./auth-session.controller";
import { authConfig } from "./auth.config";
import { AuthSessionService } from "./auth-session.service";
import { AuthTokenService } from "./auth-token.service";
import { AccessTokenGuard } from "./guards/access-token.guard";
import { NotpController } from "./notp/notp.controller";
import { NotpInboundController } from "./notp/notp.inbound.controller";
import { notpConfig } from "./notp/notp.config";
import { NotpService } from "./notp/notp.service";
import { microservicesAuthConfig } from "./microservices-auth/microservices-auth.config";
import { MicroservicesAuthController } from "./microservices-auth/microservices-auth.controller";
import { MicroservicesAuthService } from "./microservices-auth/microservices-auth.service";
import { NotpRepository } from "./notp/repositories/notp.repository";
import { AuthAccessTokenRepository } from "./repositories/auth-access-token.repository";
import { AuthIdentityRepository } from "./repositories/auth-identity.repository";
import { AuthSessionRepository } from "./repositories/auth-session.repository";

@Global()
@Module({
	imports: [
		ConfigModule.forFeature(authConfig),
		ConfigModule.forFeature(notpConfig),
		ConfigModule.forFeature(microservicesAuthConfig),
	],
	controllers: [AuthSessionController, NotpController, NotpInboundController, MicroservicesAuthController],
	providers: [
		NotpRepository,
		AuthAccessTokenRepository,
		AuthIdentityRepository,
		AuthSessionRepository,
		AuthTokenService,
		NotpService,
		AuthSessionService,
		MicroservicesAuthService,
		AccessTokenGuard,
	],
	exports: [AccessTokenGuard, AuthSessionService],
})
export class AuthModule {}
