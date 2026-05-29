import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/prisma/prisma.service";

@Injectable()
export class JobCategoryRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findByIdWithLocalizedName(params: { id: string; locale: string }): Promise<{ id: string; slug: string; displayName: string } | null> {
		const result = await this._prisma.jobCategory.findUnique({
			where: { id: params.id },
			include: {
				translations: {
					where: { locale: params.locale },
					take: 1,
				},
			},
		});

		if (!result) return null;

		return {
			id: result.id,
			slug: result.slug,
			displayName: result.translations[0]?.name ?? result.name,
		};
	}
}
