import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./repositories/auth.repository";

@Module({
	controllers: [AuthController],
	providers: [AuthRepository, AuthService],
})
export class AuthModule {}
