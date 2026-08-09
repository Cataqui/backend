import { Injectable } from "@nestjs/common";
import { JobStatus, type Prisma } from "../../../../generated/prisma/client.js";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class JobRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findById(params: { jobId: string }): Promise<Prisma.JobGetPayload<{ include: { contact: true } }> | null> {
		return this._prisma.job.findUnique({
			where: { id: params.jobId },
			include: { contact: true },
		});
	}

	async findPublicById(params: {
		jobId: string;
	}): Promise<Prisma.JobGetPayload<{ include: { contact: true } }> | null> {
		return this._prisma.job.findFirst({
			where: {
				id: params.jobId,
				status: { not: JobStatus.DRAFT },
			},
			include: { contact: true },
		});
	}

	async findActiveJobContact(params: {
		contactId: string;
		jobId: string;
	}): Promise<Prisma.JobContactGetPayload<Record<string, never>> | null> {
		const job = await this._prisma.job.findFirst({
			where: {
				id: params.jobId,
				contactId: params.contactId,
				status: JobStatus.ACTIVE,
			},
			select: { contact: true },
		});

		return job?.contact ?? null;
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
