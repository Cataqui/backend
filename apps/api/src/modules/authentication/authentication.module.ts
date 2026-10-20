import { Global, Module } from "@nestjs/common";
import { AuthenticationGuard } from "./authentication.guard";

@Global()
@Module({ providers: [AuthenticationGuard], exports: [AuthenticationGuard] })
export class AuthenticationModule {}
