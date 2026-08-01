import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { MapModule } from "../map/map.module";
import { DeriveJobDataPublisher } from "./derive-job-data.publisher";
import { JobController } from "./job.controller";
import { JobInternalController } from "./job.internal-controller";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

@Module({
	imports: [AiModule, MapModule],
	controllers: [JobController, JobInternalController],
	providers: [JobRepository, DeriveJobDataPublisher, JobService],
})
export class JobModule {}
