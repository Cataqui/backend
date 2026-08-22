import { Injectable } from "@nestjs/common";
import { JobPaymentAmountPeriod, JobPaymentType, JobStatus, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { FeedPaginationCursor } from "../schemas/feed-pagination-cursor.schema";

export interface FeedItemRaw {
	id: string;
	title: string;
	createdAt: Date;
	descriptionSummary: string;
	paymentType: JobPaymentType;
	paymentMinAmount: Prisma.Decimal | null;
	paymentMaxAmount: Prisma.Decimal | null;
	paymentNote: string | null;
	paymentAmountPeriod: JobPaymentAmountPeriod;
	paymentCurrency: string;
	fuzzyLatitude: Prisma.Decimal;
	fuzzyLongitude: Prisma.Decimal;
}

@Injectable()
export class FeedRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async getFeedItems(params: { cursor?: FeedPaginationCursor | undefined; limit: number }): Promise<FeedItemRaw[]> {
		const results = params.cursor
			? await this._prisma.$queryRaw<FeedItemRaw[]>(Prisma.sql`
					SELECT
						"id",
						"title",
						"created_at" AS "createdAt",
						"description_summary" AS "descriptionSummary",
						"payment_type" AS "paymentType",
						"payment_min_amount" AS "paymentMinAmount",
						"payment_max_amount" AS "paymentMaxAmount",
						"payment_note" AS "paymentNote",
						"payment_amount_period" AS "paymentAmountPeriod",
						"payment_currency" AS "paymentCurrency",
						"fuzzy_latitude" AS "fuzzyLatitude",
						"fuzzy_longitude" AS "fuzzyLongitude"
					FROM "public"."jobs"
					WHERE "status" = ${JobStatus.ACTIVE}::"public"."JobStatus"
						AND "title" IS NOT NULL
						AND "description_summary" IS NOT NULL
						AND "payment_type" IS NOT NULL
						AND "payment_amount_period" IS NOT NULL
						AND "payment_currency" IS NOT NULL
						AND "fuzzy_latitude" IS NOT NULL
						AND "fuzzy_longitude" IS NOT NULL
						AND ("created_at", "id") < (${new Date(params.cursor.createdAt)}, ${params.cursor.jobId}::uuid)
					ORDER BY "created_at" DESC, "id" DESC
					LIMIT ${params.limit}
				`)
			: await this._prisma.job.findMany({
					where: {
						status: JobStatus.ACTIVE,
						title: { not: null },
						descriptionSummary: { not: null },
						paymentType: { not: null },
						paymentAmountPeriod: { not: null },
						paymentCurrency: { not: null },
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
						paymentType: true,
						paymentMinAmount: true,
						paymentMaxAmount: true,
						paymentNote: true,
						paymentAmountPeriod: true,
						paymentCurrency: true,
						fuzzyLatitude: true,
						fuzzyLongitude: true,
					},
				});

		return results.map((item) => {
			if (
				item.title === null ||
				item.descriptionSummary === null ||
				item.paymentType === null ||
				item.paymentAmountPeriod === null ||
				item.paymentCurrency === null ||
				item.fuzzyLatitude === null ||
				item.fuzzyLongitude === null
			) {
				throw new Error(`Active job ${item.id} is missing fields required by the feed.`);
			}

			return {
				id: item.id,
				title: item.title,
				createdAt: item.createdAt,
				descriptionSummary: item.descriptionSummary,
				paymentType: item.paymentType,
				paymentMinAmount: item.paymentMinAmount,
				paymentMaxAmount: item.paymentMaxAmount,
				paymentNote: item.paymentNote,
				paymentAmountPeriod: item.paymentAmountPeriod,
				paymentCurrency: item.paymentCurrency,
				fuzzyLatitude: item.fuzzyLatitude,
				fuzzyLongitude: item.fuzzyLongitude,
			};
		});
	}
}
