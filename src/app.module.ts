import { Module } from "@nestjs/common";
import { ConfigModule } from "./common/config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
	imports: [ConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
