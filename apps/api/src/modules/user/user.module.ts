import { Module } from "@nestjs/common";
import { UserRepository } from "./repositories/user.repository";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
	controllers: [UserController],
	providers: [UserRepository, UserService],
	exports: [UserService],
})
export class UserModule {}
