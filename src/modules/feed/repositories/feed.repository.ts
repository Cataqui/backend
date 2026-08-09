import { Injectable } from "@nestjs/common";
import { JobPaymentAmountPeriod, JobPaymentType, JobStatus } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { FeedPaginationCursor } from "../schemas/feed-pagination-cursor.schema";

export interface FeedItemRaw {
	id: string;
	title: string;
	createdAt: Date;
	descriptionSummary: string;
	paymentType: JobPaymentType;
	paymentMinAmount: { toNumber(): number } | null;
	paymentMaxAmount: { toNumber(): number } | null;
	paymentNote: string | null;
	paymentAmountPeriod: JobPaymentAmountPeriod;
	paymentCurrency: string;
	neighborhood: string;
	fuzzyLatitude: { toNumber(): number };
	fuzzyLongitude: { toNumber(): number };
}

@Injectable()
export class FeedRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async getFeedItems(params: { cursor?: FeedPaginationCursor | undefined; limit: number }): Promise<FeedItemRaw[]> {
		const results = await this._prisma.job.findMany({
			where: {
				status: JobStatus.ACTIVE,
				title: { not: null },
				descriptionSummary: { not: null },
				paymentType: { not: null },
				paymentAmountPeriod: { not: null },
				paymentCurrency: { not: null },
				neighborhood: { not: null },
				fuzzyLatitude: { not: null },
				fuzzyLongitude: { not: null },
				...(params.cursor
					? {
							OR: [
								{ createdAt: { lt: new Date(params.cursor.createdAt) } },
								{ createdAt: new Date(params.cursor.createdAt), id: { lt: params.cursor.jobId } },
							],
						}
					: {}),
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
				neighborhood: true,
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
				item.neighborhood === null ||
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
				neighborhood: item.neighborhood,
				fuzzyLatitude: item.fuzzyLatitude,
				fuzzyLongitude: item.fuzzyLongitude,
			};
		});
	}
}
