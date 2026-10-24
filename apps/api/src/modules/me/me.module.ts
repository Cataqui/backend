import { Module } from "@nestjs/common";
import { AccountMetadataService } from "./account-metadata.service";
import { MeController } from "./me.controller";
import { AccountMetadataRepository } from "./repositories/account-metadata.repository";

@Module({ controllers: [MeController], providers: [AccountMetadataService, AccountMetadataRepository] })
export class MeModule {}
