import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { ContactModule } from "../contact/contact.module";
import { LocationModule } from "../location/location.module";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

@Module({
	imports: [AiModule, AuthModule, ContactModule, LocationModule],
	controllers: [JobController],
	providers: [JobRepository, JobService],
	exports: [JobService],
})
export class JobModule {}
