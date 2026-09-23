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
}

@Injectable()
export class FeedRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async getFeedItems(params: { cursor?: FeedPaginationCursor | undefined; limit: number }): Promise<FeedItemRaw[]> {
		const results = params.cursor
			? await this._prisma.$queryRaw<FeedItemRaw[]>(Prisma.sql`
				SELECT "id", "title", "created_at" AS "createdAt", "description_summary" AS "descriptionSummary",
					"payment", "fuzzy_latitude" AS "fuzzyLatitude", "fuzzy_longitude" AS "fuzzyLongitude"
				FROM "public"."jobs"
				WHERE "status" = ${JobStatus.ACTIVE}::"public"."JobStatus"
					AND "fuzzy_latitude" IS NOT NULL AND "fuzzy_longitude" IS NOT NULL
					AND ("created_at", "id") < (${new Date(params.cursor.createdAt)}, ${params.cursor.jobId}::uuid)
				ORDER BY "created_at" DESC, "id" DESC
				LIMIT ${params.limit}
			`)
			: await this._prisma.job.findMany({
					where: {
						status: JobStatus.ACTIVE,
						fuzzyLatitude: { not: null },
						fuzzyLongitude: { not: null },
					},
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
					},
				});
		return results.map((item) => {
			if (item.fuzzyLatitude === null || item.fuzzyLongitude === null) {
				throw new Error(`Active job ${item.id} is missing fields required by the feed.`);
			}
			return {
				id: item.id,
				title: item.title,
				createdAt: item.createdAt,
				descriptionSummary: item.descriptionSummary,
				payment: item.payment,
				fuzzyLatitude: item.fuzzyLatitude,
				fuzzyLongitude: item.fuzzyLongitude,
			};
		});
	}
}
