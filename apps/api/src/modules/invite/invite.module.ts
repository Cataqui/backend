import { Module } from "@nestjs/common";
import { InviteService } from "./invite.service";
import { InviteRepository } from "./repositories/invite.repository";

@Module({ providers: [InviteService, InviteRepository], exports: [InviteService] })
export class InviteModule {}
