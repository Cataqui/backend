import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { PrismaModule } from "./shared/prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { JobModule } from "./modules/job/job.module";
import { FeedModule } from "./modules/feed/feed.module";

@Module({
	imports: [ConfigModule, PrismaModule, HealthModule, JobModule, FeedModule],
})
export class AppModule {}
