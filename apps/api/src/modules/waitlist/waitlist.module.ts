import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { InviteModule } from "../invite/invite.module";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";
import { WaitlistUnitOfWork } from "./waitlist.unit-of-work";

@Module({
	imports: [AccountModule, InviteModule],
	controllers: [WaitlistController],
	providers: [WaitlistService, WaitlistUnitOfWork],
})
export class WaitlistModule {}
