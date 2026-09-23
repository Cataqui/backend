import { Injectable } from "@nestjs/common";
import { type JobContactMethod, JobStatus, Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";

const _publicJobOutputSelection = {
	id: true,
	title: true,
	description: true,
	descriptionSummary: true,
	contact: { select: { id: true, contactMethod: true } },
	fuzzyLatitude: true,
	fuzzyLongitude: true,
	payment: true,
	status: true,
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

	async findByIdempotencyKey(params: {
		posterUserId: string;
		idempotencyKey: string;
	}): Promise<Prisma.JobPostRequestGetPayload<{ include: { job: { include: { contact: true } } } }> | null> {
		return this._prisma.jobPostRequest.findUnique({
			where: {
				posterUserId_idempotencyKey: {
					posterUserId: params.posterUserId,
					idempotencyKey: params.idempotencyKey,
				},
			},
			include: { job: { include: { contact: true } } },
		});
	}

	async createJob(params: {
		posterUserId: string;
		idempotencyKey: string;
		requestHash: string;
		contactId: string;
		description: string;
		payment: string | null;
		title: string;
		descriptionSummary: string;
		location: { latitude: number; longitude: number };
		fuzzyLocation: { latitude: number; longitude: number };
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }>> {
		return this._prisma.$transaction(async (tx) => {
			const job = await tx.job.create({
				data: {
					posterUserId: params.posterUserId,
					contactId: params.contactId,
					description: params.description,
					payment: params.payment,
					title: params.title,
					descriptionSummary: params.descriptionSummary,
					fuzzyLatitude: params.fuzzyLocation.latitude,
					fuzzyLongitude: params.fuzzyLocation.longitude,
					status: JobStatus.ACTIVE,
				},
				include: { contact: true },
			});
			await tx.$executeRaw`
				UPDATE "public"."jobs"
				SET "location_point" = ST_SetSRID(ST_MakePoint(${params.location.longitude}, ${params.location.latitude}), 4326)
				WHERE "id" = ${job.id}::uuid
			`;
			await tx.jobPostRequest.create({
				data: {
					posterUserId: params.posterUserId,
					idempotencyKey: params.idempotencyKey,
					requestHash: params.requestHash,
					jobId: job.id,
				},
			});
			return job;
		});
	}

	async findPublicById(params: { jobId: string }): Promise<PublicJobRaw | null> {
		const [databaseJob] = await this._prisma.$queryRaw<PublicJobDatabaseRow[]>(Prisma.sql`
			SELECT
				job."id", job."title", job."description", job."description_summary" AS "descriptionSummary",
				job_contact."id" AS "contactId", job_contact."contact_method" AS "contactMethod",
				job."fuzzy_latitude" AS "fuzzyLatitude", job."fuzzy_longitude" AS "fuzzyLongitude",
				job."payment", job."status", job."created_at" AS "createdAt", job."updated_at" AS "updatedAt"
			FROM "public"."jobs" AS job
			LEFT JOIN "public"."job_contact_methods" AS job_contact ON job_contact."id" = job."contact_id"
			WHERE job."id" = ${params.jobId}::uuid
		`);
		if (databaseJob === undefined) return null;
		const { contactId, contactMethod, ...publicJobFields } = databaseJob;
		return {
			...publicJobFields,
			contact: contactId === null || contactMethod === null ? null : { id: contactId, contactMethod: contactMethod },
		};
	}

	async findActiveJobContact(params: {
		contactId: string;
		jobId: string;
	}): Promise<{ contactMethod: JobContactMethod; identifier: string } | null> {
		return this._prisma.jobContact.findFirst({
			where: { id: params.contactId, jobs: { some: { id: params.jobId, status: JobStatus.ACTIVE } } },
			select: { contactMethod: true, identifier: true },
		});
	}
}
