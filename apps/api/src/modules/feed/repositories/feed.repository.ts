import { Injectable } from "@nestjs/common";
import { JobStatus, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { FeedPaginationCursor } from "../schemas/feed-pagination-cursor.schema";

export interface FeedItemRaw {
	id: string;
	title: string;
	createdAt: Date;
	descriptionSummary: string;
	payment: string | null;
	fuzzyLatitude: Prisma.Decimal;
	fuzzyLongitude: Prisma.Decimal;
	locationImageUrl: string | null;
}

@Injectable()
export class FeedRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async getFeedItems(params: { cursor?: FeedPaginationCursor | undefined; limit: number }): Promise<FeedItemRaw[]> {
		const results = params.cursor
			? await this._prisma.$queryRaw<FeedItemRaw[]>(Prisma.sql`
				SELECT "id", "title", "created_at" AS "createdAt", "description_summary" AS "descriptionSummary",
					"location_image_url" AS "locationImageUrl", "payment", "fuzzy_latitude" AS "fuzzyLatitude", "fuzzy_longitude" AS "fuzzyLongitude"
				FROM "public"."jobs"
				WHERE "status" = ${JobStatus.ACTIVE}::"public"."JobStatus"
					AND ("created_at", "id") < (${new Date(params.cursor.createdAt)}, ${params.cursor.jobId}::uuid)
				ORDER BY "created_at" DESC, "id" DESC
				LIMIT ${params.limit}
			`)
			: await this._prisma.job.findMany({
					where: { status: JobStatus.ACTIVE },
					orderBy: [{ createdAt: "desc" }, { id: "desc" }],
					take: params.limit,
					select: {
						id: true,
						title: true,
						createdAt: true,
						descriptionSummary: true,
						payment: true,
						fuzzyLatitude: true,
						fuzzyLongitude: true,
						locationImageUrl: true,
					},
				});
		return results;
	}
}
