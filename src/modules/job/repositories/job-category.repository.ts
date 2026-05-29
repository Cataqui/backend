import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma/prisma.service";

@Injectable()
export class JobCategoryRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findById(params: { id: string }) {
		return this._prisma.jobCategory.findUnique({ where: { id: params.id } });
	}
}
