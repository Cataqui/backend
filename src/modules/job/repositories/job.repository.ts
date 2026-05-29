import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { Prisma } from "../../../../generated/prisma/client.js";

@Injectable()
export class JobRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async create(params: { data: Prisma.JobUncheckedCreateInput }) {
		const job = await this._prisma.job.create({
			data: {
				...params.data,
				street: params.data.street ?? null,
				neighborhood: params.data.neighborhood ?? null,
			},
			include: { category: true },
		});

		return job;
	}
}
