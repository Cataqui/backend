import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module";
import { PrismaModule } from "./shared/prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
	imports: [ConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
