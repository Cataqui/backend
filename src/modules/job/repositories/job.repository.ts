import { Injectable } from "@nestjs/common";
import type { JobContactMethod, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { LocaleConstants } from "../../../shared/locale/locale.constants";
import { LocaleUtils } from "../../../shared/locale/locale.utils";

@Injectable()
export class JobRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findByIdLocalized(params: { id: string; locale: string }): Promise<
		| (Prisma.JobGetPayload<{ include: { category: true; contact: true } }> & {
				categoryDisplayName: string;
		  })
		| null
	> {
		const job = await this._prisma.job.findUnique({
			where: { id: params.id },
			include: {
				category: {
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
				},
				contact: true,
			},
		});

		if (!job) return null;

		return {
			...job,
			category: {
				id: job.category.id,
				slug: job.category.slug,
				createdAt: job.category.createdAt,
				updatedAt: job.category.updatedAt,
			},
			categoryDisplayName:
				LocaleUtils.resolveLocalizedString({
					translations: job.category.translations.map((t) => ({
						locale: t.locale,
						string: t.name,
					})),
					targetLocale: params.locale,
				}) ?? "",
		};
	}

	async create(params: {
		data: Prisma.JobUncheckedCreateInput;
		contact: {
			contactMethod: JobContactMethod;
			identifier: string;
		};
		locationPoint: {
			latitude: number;
			longitude: number;
		};
	}): Promise<Prisma.JobGetPayload<{ include: { category: true; contact: true } }>> {
		const job = await this._prisma.$transaction(async (tx) => {
			const createdJob = await tx.job.create({
				data: {
					...params.data,
					street: params.data.street ?? null,
					contact: {
						create: {
							contactMethod: params.contact.contactMethod,
							identifier: params.contact.identifier,
						},
					},
				},
				include: { category: true, contact: true },
			});

			await tx.$executeRaw`
				UPDATE "jobs"
				SET "location_point" = ST_SetSRID(ST_MakePoint(${params.locationPoint.longitude}, ${params.locationPoint.latitude}), 4326)
				WHERE "id" = ${createdJob.id}::uuid
			`;

			return createdJob;
		});

		return job;
	}

	async updateDescriptionSummary(params: { jobId: string; summary: string }): Promise<void> {
		await this._prisma.job.update({
			where: { id: params.jobId },
			data: { descriptionSummary: params.summary },
		});
	}
}
