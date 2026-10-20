import { Module } from "@nestjs/common";
import { JobModule } from "../job/job.module";
import { ProfileGuard } from "./profile.guard";
import { ContactModule } from "../contact/contact.module";
import { ProfileRepository } from "./repositories/profile.repository";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
	imports: [ContactModule, JobModule],
	controllers: [ProfileController],
	providers: [ProfileRepository, ProfileService, ProfileGuard],
	exports: [ProfileGuard],
})
export class ProfileModule {}
