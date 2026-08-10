import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { LocationModule } from "../location/location.module";
import { UserModule } from "../user/user.module";
import { JobController } from "./job.controller";
import { JobInboundController } from "./job.inbound.controller";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

@Module({
	imports: [AiModule, AuthModule, LocationModule, UserModule],
	controllers: [JobController, JobInboundController],
	providers: [JobRepository, JobService],
})
export class JobModule {}
