import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { WorkerholeModule } from "./workerhole.module";
import { AppController } from "./app.controller";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { RedisModule } from "./core/redis/redis.module";
import { ThrottleModule } from "./core/throttle/throttle.module";
import { AuthenticationGuard } from "./modules/authentication/authentication.guard";
import { AuthenticationModule } from "./modules/authentication/authentication.module";
import { ContactModule } from "./modules/contact/contact.module";
import { FeedModule } from "./modules/feed/feed.module";
import { HealthModule } from "./modules/health/health.module";
import { JobModule } from "./modules/job/job.module";
import { ProfileGuard } from "./modules/profile/profile.guard";
import { ProfileModule } from "./modules/profile/profile.module";

@Module({
	imports: [
		WorkerholeModule,
		ConfigModule,
		PrismaModule,
		RedisModule,
		HealthModule,
		JobModule,
		FeedModule,
		AuthenticationModule,
		ContactModule,
		ProfileModule,
		ThrottleModule,
	],
	controllers: [AppController],
	providers: [
		{ provide: APP_GUARD, useExisting: AuthenticationGuard },
		{ provide: APP_GUARD, useExisting: ProfileGuard },
	],
})
export class AppModule {}
