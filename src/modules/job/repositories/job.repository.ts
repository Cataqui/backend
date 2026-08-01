import { Injectable } from "@nestjs/common";
import { JobStatus, type JobContactMethod, type Prisma } from "../../../../generated/prisma/client.js";
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

	async createDraft(params: { description: string }): Promise<Prisma.JobGetPayload<{ include: { contact: true } }>> {
		return this._prisma.job.create({
			data: {
				description: params.description,
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
		data: Prisma.JobUncheckedUpdateInput;
		contact?: {
			contactMethod: JobContactMethod;
			identifier: string;
		};
		locationPoint?: {
			latitude: number;
			longitude: number;
		};
	}): Promise<void> {
		await this._prisma.$transaction(async (tx) => {
			await tx.job.update({
				where: { id: params.jobId },
				data: {
					...params.data,
					...(params.contact && {
						contact: {
							upsert: {
								create: {
									contactMethod: params.contact.contactMethod,
									identifier: params.contact.identifier,
								},
								update: {
									contactMethod: params.contact.contactMethod,
									identifier: params.contact.identifier,
								},
							},
						},
					}),
				},
			});

			if (!params.locationPoint) return;

			await tx.$executeRaw`
				UPDATE "jobs"
				SET "location_point" = ST_SetSRID(ST_MakePoint(${params.locationPoint.longitude}, ${params.locationPoint.latitude}), 4326)
				WHERE "id" = ${params.jobId}::uuid
			`;
		});
	}

	async publishDraft(params: { jobId: string }): Promise<Prisma.JobGetPayload<{ include: { contact: true } }>> {
		return this._prisma.job.update({
			where: {
				id: params.jobId,
				status: JobStatus.DRAFT,
			},
			data: {
				status: JobStatus.ACTIVE,
			},
			include: { contact: true },
		});
	}

	async findContactByIdAndJobId(params: {
		contactId: string;
		jobId: string;
	}): Promise<Prisma.JobContactGetPayload<Record<string, never>> | null> {
		return this._prisma.jobContact.findFirst({
			where: {
				id: params.contactId,
				jobId: params.jobId,
				job: {
					status: { not: JobStatus.DRAFT },
				},
			},
		});
	}
}
