import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { LocaleConstants } from "../../../shared/locale/locale.constants";
import { LocaleUtils } from "../../../shared/locale/locale.utils";

@Injectable()
export class JobCategoryRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findByIdWithLocalizedName(params: {
		id: string;
		locale: string;
	}): Promise<{ id: string; slug: string; displayName: string } | null> {
		const result = await this._prisma.jobCategory.findUnique({
			where: { id: params.id },
			include: {
				translations: {
					where: {
						locale: {
							in: [params.locale, LocaleConstants.DEFAULT_LOCALE],
							mode: "insensitive",
						},
					},
				},
			},
		});

		if (!result) return null;

		return {
			id: result.id,
			slug: result.slug,
			displayName:
				LocaleUtils.resolveLocalizedString({
					translations: result.translations.map((t) => ({
						locale: t.locale,
						string: t.name,
					})),
					targetLocale: params.locale,
				}) ?? "",
		};
	}
}
