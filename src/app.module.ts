import { Module } from "@nestjs/common";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { JobModule } from "./modules/job/job.module";
import { FeedModule } from "./modules/feed/feed.module";
import { ThrottleModule } from "./core/throttle/throttle.module";

@Module({
	imports: [ConfigModule, PrismaModule, HealthModule, JobModule, FeedModule, ThrottleModule],
})
export class AppModule {}
