import { Module } from "@nestjs/common";
import { ContactService } from "./contact.service";
import { ContactRepository } from "./repositories/contact.repository";

@Module({
	providers: [ContactRepository, ContactService],
	exports: [ContactService],
})
export class ContactModule {}
