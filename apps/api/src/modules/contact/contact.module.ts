import { Module } from "@nestjs/common";
import { ContactController } from "./contact.controller";
import { ContactService } from "./contact.service";
import { ContactRepository } from "./repositories/contact.repository";

@Module({
	controllers: [ContactController],
	providers: [ContactRepository, ContactService],
	exports: [ContactService],
})
export class ContactModule {}
