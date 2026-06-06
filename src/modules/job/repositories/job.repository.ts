import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { Prisma } from "../../../../generated/prisma/client.js";

@Injectable()
export class JobRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findByIdLocalized(params: { id: string; locale: string }): Promise<(Prisma.JobGetPayload<{ include: { category: true } }> & { categoryDisplayName: string }) | null> {
		const job = await this._prisma.job.findUnique({
			where: { id: params.id },
			include: {
				category: {
					include: {
						translations: {
							where: { locale: params.locale },
							take: 1,
						},
					},
				},
			},
		});

		if (!job) return null;

		return {
			...job,
			category: { id: job.category.id, name: job.category.name, slug: job.category.slug, createdAt: job.category.createdAt, updatedAt: job.category.updatedAt },
			categoryDisplayName: job.category.translations[0]?.name ?? job.category.name,
		};
	}

	async create(params: { data: Prisma.JobUncheckedCreateInput }): Promise<Prisma.JobGetPayload<{ include: { category: true } }>> {
		const job = await this._prisma.job.create({
			data: {
				...params.data,
				street: params.data.street ?? null,
			},
			include: { category: true },
		});

		return job;
	}
}
