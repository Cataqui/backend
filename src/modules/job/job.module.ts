import { Module } from "@nestjs/common";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";
import { JobCategoryRepository } from "./repositories/job-category.repository";
import { MapModule } from "../map/map.module";

@Module({
	imports: [MapModule],
	controllers: [JobController],
	providers: [JobRepository, JobCategoryRepository, JobService],
})
export class JobModule {}
