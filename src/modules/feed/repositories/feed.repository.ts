import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { JobStatus, JobPaymentRecurrence } from "../../../../generated/prisma/client.js";
import type { IFeedPaginationCursor } from "../interfaces/feed-pagination-cursor.interface";

export interface FeedItemRaw {
	id: string;
	title: string;
	createdAt: Date;
	paymentAmount: { toNumber(): number };
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
				expiresAt: { gt: new Date() },
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
				paymentAmount: true,
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
