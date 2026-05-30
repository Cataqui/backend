import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { JobStatus, JobPaymentRecurrence, JobPaymentType } from "../../../../generated/prisma/client.js";
import type { IFeedPaginationCursor } from "../interfaces/feed-pagination-cursor.interface";

export interface FeedItemRaw {
	id: string;
	title: string;
	createdAt: Date;
	paymentType: JobPaymentType;
	paymentMinAmount: { toNumber(): number } | null;
	paymentMaxAmount: { toNumber(): number } | null;
	paymentNote: string | null;
	paymentRecurrence: JobPaymentRecurrence;
	paymentCurrency: string;
	neighborhood: string | null;
	city: string;
	state: string;
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
							OR: [{ createdAt: { lt: new Date(params.cursor.createdAt) } }, { createdAt: new Date(params.cursor.createdAt), id: { lt: params.cursor.jobId } }],
						}
					: {}),
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: params.limit,
			select: {
				id: true,
				title: true,
				createdAt: true,
				paymentType: true,
				paymentMinAmount: true,
				paymentMaxAmount: true,
				paymentNote: true,
				paymentRecurrence: true,
				paymentCurrency: true,
				neighborhood: true,
				city: true,
				state: true,
			},
		});

		return results;
	}
}
