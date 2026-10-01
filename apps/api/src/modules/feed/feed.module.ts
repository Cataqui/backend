import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { FeedRepository } from "./repositories/feed.repository";

@Module({
	imports: [AuthModule],
	controllers: [FeedController],
	providers: [FeedRepository, FeedService],
})
export class FeedModule {}
