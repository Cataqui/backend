import { Module } from "@nestjs/common";
import { AiModule } from "../../core/ai/ai.module";
import { MapModule } from "../map/map.module";
import { JobDescriptionService } from "./job-description.service";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";
import { JobCategoryRepository } from "./repositories/job-category.repository";
import { JobRepository } from "./repositories/job.repository";

@Module({
	imports: [MapModule, AiModule],
	controllers: [JobController],
	providers: [JobRepository, JobCategoryRepository, JobDescriptionService, JobService],
})
export class JobModule {}
