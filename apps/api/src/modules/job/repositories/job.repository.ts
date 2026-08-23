import { Injectable } from "@nestjs/common";
import { type JobContactMethod, JobStatus, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";

const _publicJobOutputSelection = {
	id: true,
	title: true,
	description: true,
	descriptionSummary: true,
	contact: {
		select: {
			id: true,
			contactMethod: true,
		},
	},
	fuzzyLatitude: true,
	fuzzyLongitude: true,
	paymentType: true,
	paymentMinAmount: true,
	paymentMaxAmount: true,
	paymentNote: true,
	paymentAmountPeriod: true,
	paymentCurrency: true,
	status: true,
	type: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.JobSelect;

export type PublicJobRaw = Prisma.JobGetPayload<{ select: typeof _publicJobOutputSelection }>;

type PublicJobDatabaseRow = Omit<PublicJobRaw, "contact"> & {
	contactId: string | null;
	contactMethod: JobContactMethod | null;
};

@Injectable()
export class JobRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findById(params: { jobId: string }): Promise<Prisma.JobGetPayload<{ include: { contact: true } }> | null> {
		return this._prisma.job.findUnique({
			where: { id: params.jobId },
			include: { contact: true },
		});
	}

	async findPublicById(params: { jobId: string }): Promise<PublicJobRaw | null> {
		const [databaseJob] = await this._prisma.$queryRaw<PublicJobDatabaseRow[]>(Prisma.sql`
			SELECT
				job."id",
				job."title",
				job."description",
				job."description_summary" AS "descriptionSummary",
				job_contact."id" AS "contactId",
				job_contact."contact_method" AS "contactMethod",
				job."fuzzy_latitude" AS "fuzzyLatitude",
				job."fuzzy_longitude" AS "fuzzyLongitude",
				job."payment_type" AS "paymentType",
				job."payment_min_amount" AS "paymentMinAmount",
				job."payment_max_amount" AS "paymentMaxAmount",
				job."payment_note" AS "paymentNote",
				job."payment_amount_period" AS "paymentAmountPeriod",
				job."payment_currency" AS "paymentCurrency",
				job."status",
				job."type",
				job."created_at" AS "createdAt",
				job."updated_at" AS "updatedAt"
			FROM "public"."jobs" AS job
			LEFT JOIN "public"."job_contact_methods" AS job_contact ON job_contact."id" = job."contact_id"
			WHERE job."id" = ${params.jobId}::uuid
				AND job."status" <> ${JobStatus.DRAFT}::"public"."JobStatus"
		`);

		if (databaseJob === undefined) return null;

		const { contactId, contactMethod, ...publicJobFields } = databaseJob;

		return {
			...publicJobFields,
			contact:
				contactId === null || contactMethod === null
					? null
					: {
							id: contactId,
							contactMethod: contactMethod,
						},
		};
	}

	async findActiveJobContact(params: {
		contactId: string;
		jobId: string;
	}): Promise<{ contactMethod: JobContactMethod; identifier: string } | null> {
		return this._prisma.jobContact.findFirst({
			where: {
				id: params.contactId,
				jobs: {
					some: {
						id: params.jobId,
						status: JobStatus.ACTIVE,
					},
				},
			},
			select: {
				contactMethod: true,
				identifier: true,
			},
		});
	}

	async findByIdFromPoster(params: {
		jobId: string;
		posterUserId: string;
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }> | null> {
		return this._prisma.job.findFirst({
			where: {
				id: params.jobId,
				posterUserId: params.posterUserId,
			},
			include: { contact: true },
		});
	}

	async findDraftByIdFromPoster(params: {
		jobId: string;
		posterUserId: string;
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }> | null> {
		return this._prisma.job.findFirst({
			where: {
				id: params.jobId,
				posterUserId: params.posterUserId,
				status: JobStatus.DRAFT,
			},
			include: { contact: true },
		});
	}

	async findPublicByIdFromPoster(params: {
		jobId: string;
		posterUserId: string;
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }> | null> {
		return this._prisma.job.findFirst({
			where: {
				id: params.jobId,
				posterUserId: params.posterUserId,
				status: { not: JobStatus.DRAFT },
			},
			include: { contact: true },
		});
	}

	async createDraft(params: {
		description: string;
		posterUserId: string;
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }>> {
		return this._prisma.job.create({
			data: {
				description: params.description,
				posterUserId: params.posterUserId,
				descriptionSummary: null,
				title: null,
				status: JobStatus.DRAFT,
				type: null,
				paymentType: null,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: null,
				paymentCurrency: null,
			},
			include: { contact: true },
		});
	}

	async updateDerivedJobDataIfDescriptionUnchanged(params: {
		jobId: string;
		description: string;
		title: string;
		descriptionSummary: string;
	}): Promise<void> {
		await this._prisma.job.updateMany({
			where: {
				id: params.jobId,
				description: params.description,
			},

			data: {
				title: params.title,
				descriptionSummary: params.descriptionSummary,
			},
		});
	}

	async update(params: {
		jobId: string;
		posterUserId: string;
		data: Prisma.JobUncheckedUpdateInput;
		locationPoint?: {
			latitude: number;
			longitude: number;
		};
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }>> {
		return this._prisma.$transaction(async (tx) => {
			const updatedJob = await tx.job.update({
				where: {
					id: params.jobId,
					posterUserId: params.posterUserId,
				},
				data: {
					...params.data,
				},
				include: { contact: true },
			});

			if (!params.locationPoint) return updatedJob;

			await tx.$executeRaw`
				UPDATE "jobs"
				SET "location_point" = ST_SetSRID(ST_MakePoint(${params.locationPoint.longitude}, ${params.locationPoint.latitude}), 4326)
				WHERE "id" = ${params.jobId}::uuid
				AND "poster_user_id" = ${params.posterUserId}::uuid
			`;

			return updatedJob;
		});
	}

	async publishDraft(params: {
		jobId: string;
		posterUserId: string;
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }>> {
		return this._prisma.job.update({
			where: {
				id: params.jobId,
				posterUserId: params.posterUserId,
				status: JobStatus.DRAFT,
			},
			data: {
				status: JobStatus.ACTIVE,
			},
			include: { contact: true },
		});
	}
}
