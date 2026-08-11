import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { RedisModule } from "./core/redis/redis.module";
import { ThrottleModule } from "./core/throttle/throttle.module";
import { AuthModule } from "./modules/auth/auth.module";
import { FeedModule } from "./modules/feed/feed.module";
import { HealthModule } from "./modules/health/health.module";
import { JobModule } from "./modules/job/job.module";
import { UserModule } from "./modules/user/user.module";

@Module({
	imports: [
		ConfigModule,
		PrismaModule,
		RedisModule,
		HealthModule,
		JobModule,
		FeedModule,
		AuthModule,
		UserModule,
		ThrottleModule,
	],
	controllers: [AppController],
})
export class AppModule {}
