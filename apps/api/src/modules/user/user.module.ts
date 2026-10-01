import { Module } from "@nestjs/common";
import { ContactModule } from "../contact/contact.module";
import { JobModule } from "../job/job.module";
import { UserRepository } from "./repositories/user.repository";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
	imports: [ContactModule, JobModule],
	controllers: [UserController],
	providers: [UserRepository, UserService],
})
export class UserModule {}
