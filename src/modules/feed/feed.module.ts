import { Module } from "@nestjs/common";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { FeedRepository } from "./repositories/feed.repository";
import { MapModule } from "../map/map.module";

@Module({
	imports: [MapModule],
	controllers: [FeedController],
	providers: [FeedRepository, FeedService],
})
export class FeedModule {}
