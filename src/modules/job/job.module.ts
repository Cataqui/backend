import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { DeriveJobDataPublisher } from "./derive-job-data.publisher";
import { JobController } from "./job.controller";
import { JobInternalController } from "./job.internal-controller";
import { JobLocationService } from "./job-location.service";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

@Module({
	imports: [AiModule],
	controllers: [JobController, JobInternalController],
	providers: [JobRepository, DeriveJobDataPublisher, JobLocationService, JobService],
})
export class JobModule {}
