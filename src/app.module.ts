import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ConfigModule } from "./core/config/config.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { ThrottleModule } from "./core/throttle/throttle.module";
import { FeedModule } from "./modules/feed/feed.module";
import { HealthModule } from "./modules/health/health.module";
import { JobModule } from "./modules/job/job.module";
import { MapModule } from "./modules/map/map.module";
import { AiModule } from "./core/ai/ai.module";

@Module({
	imports: [ConfigModule, PrismaModule, HealthModule, JobModule, FeedModule, MapModule, ThrottleModule, AiModule],
	controllers: [AppController],
})
export class AppModule {}
