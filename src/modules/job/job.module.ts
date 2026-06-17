import { Module } from "@nestjs/common";
import { AiModule } from "../../core/ai/ai.module";
import { MapModule } from "../map/map.module";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";
import { JobCategoryRepository } from "./repositories/job-category.repository";

@Module({
	imports: [MapModule, AiModule],
	controllers: [JobController],
	providers: [JobRepository, JobCategoryRepository, JobService],
})
export class JobModule {}
