import { Injectable } from "@nestjs/common";
import { type ContactMethod, JobStatus, Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { ProfileJobsCursor } from "../schemas/profile-jobs-cursor.schema";

const _publicJobOutputSelection = {
	id: true,
	title: true,
	description: true,
	descriptionSummary: true,
	contact: { select: { id: true, contactMethod: true } },
	fuzzyLatitude: true,
	fuzzyLongitude: true,
	locationImageUrl: true,
	payment: true,
	status: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.JobSelect;

export type PublicJobRaw = Prisma.JobGetPayload<{ select: typeof _publicJobOutputSelection }>;

const _profileJobSummaryOutputSelection = {
	id: true,
	title: true,
	descriptionSummary: true,
	payment: true,
	fuzzyLatitude: true,
	fuzzyLongitude: true,
	locationImageUrl: true,
	status: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.JobSelect;

export type ProfileJobSummaryRaw = Prisma.JobGetPayload<{ select: typeof _profileJobSummaryOutputSelection }>;

const _profileJobOutputSelection = {
	id: true,
	description: true,
	contact: { select: { contactMethod: true, identifier: true } },
	locationTitle: true,
	fuzzyLatitude: true,
	fuzzyLongitude: true,
	locationImageUrl: true,
	status: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.JobSelect;

export type ProfileJobRaw = Prisma.JobGetPayload<{ select: typeof _profileJobOutputSelection }>;

type PublicJobDatabaseRow = Omit<PublicJobRaw, "contact"> & {
	contactId: string | null;
	contactMethod: ContactMethod | null;
};

@Injectable()
export class JobRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findProfileJobs(params: {
		posterProfileId: string;
		cursor?: ProfileJobsCursor | undefined;
		limit: number;
	}): Promise<ProfileJobSummaryRaw[]> {
		return this._prisma.job.findMany({
			where: {
				posterProfileId: params.posterProfileId,
				...(params.cursor === undefined
					? {}
					: {
							OR: [
								{ createdAt: { lt: new Date(params.cursor.createdAt) } },
								{ createdAt: new Date(params.cursor.createdAt), id: { lt: params.cursor.jobId } },
							],
						}),
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: params.limit,
			select: _profileJobSummaryOutputSelection,
		});
	}

	async findProfileJobById(params: { jobId: string; posterProfileId: string }): Promise<ProfileJobRaw | null> {
		return this._prisma.job.findFirst({
			where: { id: params.jobId, posterProfileId: params.posterProfileId },
			select: _profileJobOutputSelection,
		});
	}

	async findByIdempotencyKey(params: {
		posterProfileId: string;
		idempotencyKey: string;
	}): Promise<Prisma.JobPostRequestGetPayload<{ include: { job: { include: { contact: true } } } }> | null> {
		return this._prisma.jobPostRequest.findUnique({
			where: {
				posterProfileId_idempotencyKey: {
					posterProfileId: params.posterProfileId,
					idempotencyKey: params.idempotencyKey,
				},
			},
			include: { job: { include: { contact: true } } },
		});
	}

	async reservePostRequest(params: {
		posterProfileId: string;
		idempotencyKey: string;
		requestHash: string;
		fuzzyLocation: { latitude: number; longitude: number };
	}): Promise<Prisma.JobPostRequestGetPayload<{ include: { job: { include: { contact: true } } } }>> {
		await this._prisma.jobPostRequest.createMany({
			data: [
				{
					posterProfileId: params.posterProfileId,
					idempotencyKey: params.idempotencyKey,
					requestHash: params.requestHash,
					fuzzyLatitude: params.fuzzyLocation.latitude,
					fuzzyLongitude: params.fuzzyLocation.longitude,
				},
			],
			skipDuplicates: true,
		});
		return this._prisma.jobPostRequest.findUniqueOrThrow({
			where: {
				posterProfileId_idempotencyKey: {
					posterProfileId: params.posterProfileId,
					idempotencyKey: params.idempotencyKey,
				},
			},
			include: { job: { include: { contact: true } } },
		});
	}

	async createJob(params: {
		posterProfileId: string;
		postRequestId: string;
		locationImageUrl: string;
		contactId: string;
		description: string;
		payment: string | null;
		title: string;
		descriptionSummary: string;
		location: { title: string; latitude: number; longitude: number };
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }>> {
		return this._prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT "id" FROM "public"."job_post_requests" WHERE "id" = ${params.postRequestId}::uuid FOR UPDATE`;
			const request = await tx.jobPostRequest.findUniqueOrThrow({
				where: { id: params.postRequestId },
				include: { job: { include: { contact: true } } },
			});
			if (request.job !== null) return request.job;
			const job = await tx.job.create({
				data: {
					posterProfileId: params.posterProfileId,
					contactId: params.contactId,
					description: params.description,
					payment: params.payment,
					title: params.title,
					descriptionSummary: params.descriptionSummary,
					locationTitle: params.location.title,
					fuzzyLatitude: request.fuzzyLatitude,
					fuzzyLongitude: request.fuzzyLongitude,
					locationImageUrl: params.locationImageUrl,
					status: JobStatus.ACTIVE,
				},
				include: { contact: true },
			});
			await tx.$executeRaw`
				UPDATE "public"."jobs"
				SET "location_point" = ST_SetSRID(ST_MakePoint(${params.location.longitude}, ${params.location.latitude}), 4326)
				WHERE "id" = ${job.id}::uuid
			`;
			await tx.jobPostRequest.update({ where: { id: params.postRequestId }, data: { jobId: job.id } });
			return job;
		});
	}

	async archiveOwnedJob(params: { jobId: string; posterProfileId: string }): Promise<PublicJobRaw | null> {
		await this._prisma.job.updateMany({
			where: { id: params.jobId, posterProfileId: params.posterProfileId, status: JobStatus.ACTIVE },
			data: { status: JobStatus.ARCHIVED },
		});
		return this._prisma.job.findFirst({
			where: { id: params.jobId, posterProfileId: params.posterProfileId },
			select: _publicJobOutputSelection,
		});
	}

	async activateOwnedJob(params: { jobId: string; posterProfileId: string }): Promise<PublicJobRaw | null> {
		await this._prisma.job.updateMany({
			where: { id: params.jobId, posterProfileId: params.posterProfileId, status: JobStatus.ARCHIVED },
			data: { status: JobStatus.ACTIVE },
		});
		return this._prisma.job.findFirst({
			where: { id: params.jobId, posterProfileId: params.posterProfileId },
			select: _publicJobOutputSelection,
		});
	}

	async findActiveJobContact(params: {
		jobId: string;
		contactId: string;
	}): Promise<{ contactMethod: ContactMethod; identifier: string } | null> {
		return this._prisma.contact.findFirst({
			where: {
				id: params.contactId,
				jobs: { some: { id: params.jobId, status: JobStatus.ACTIVE } },
			},
			select: { contactMethod: true, identifier: true },
		});
	}

	async findPublicById(params: { jobId: string }): Promise<PublicJobRaw | null> {
		const [databaseJob] = await this._prisma.$queryRaw<PublicJobDatabaseRow[]>(Prisma.sql`
			SELECT
				job."id", job."title", job."description", job."description_summary" AS "descriptionSummary",
				contact."id" AS "contactId", contact."contact_method" AS "contactMethod",
				job."fuzzy_latitude" AS "fuzzyLatitude", job."fuzzy_longitude" AS "fuzzyLongitude",
				job."location_image_url" AS "locationImageUrl", job."payment", job."status", job."created_at" AS "createdAt", job."updated_at" AS "updatedAt"
			FROM "public"."jobs" AS job
			LEFT JOIN "public"."contacts" AS contact ON contact."id" = job."contact_id"
			WHERE job."id" = ${params.jobId}::uuid
		`);
		if (databaseJob === undefined) return null;
		const { contactId, contactMethod, ...publicJobFields } = databaseJob;
		return {
			...publicJobFields,
			contact: contactId === null || contactMethod === null ? null : { id: contactId, contactMethod: contactMethod },
		};
	}
}
