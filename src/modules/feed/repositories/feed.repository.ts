import { Injectable } from "@nestjs/common";
import { JobPaymentAmountPeriod, JobPaymentType, JobStatus } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { IFeedPaginationCursor } from "../interfaces/feed-pagination-cursor.interface";

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

	async getFeedItems(params: { cursor?: IFeedPaginationCursor | undefined; limit: number }): Promise<FeedItemRaw[]> {
		const results = await this._prisma.job.findMany({
			where: {
				status: JobStatus.ACTIVE,
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

		return results;
	}
}
