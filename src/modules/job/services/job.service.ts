import { Injectable } from "@nestjs/common";
import { JobRepository } from "../repositories/job.repository";
import { JobCategoryRepository } from "../repositories/job-category.repository";
import { CategoryNotFoundError } from "../errors/category-not-found.error";
import { JobStatus } from "../../../../generated/prisma/client.js";
import { JobOutputDto } from "../dto/job-output.dto";
import { CreateJobRequestDto } from "../dto/create-job-request.dto";
import { DateUtils } from "../../../shared/utils/date.utils";

const DEFAULT_EXPIRATION_DAYS = 30;

@Injectable()
export class JobService {
	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _jobCategoryRepository: JobCategoryRepository,
	) {}

	async createJob(dto: CreateJobRequestDto, locale: string): Promise<JobOutputDto> {
		const category = await this._jobCategoryRepository.findByIdWithLocalizedName({ id: dto.categoryId, locale });
		if (!category) throw new CategoryNotFoundError(dto.categoryId);

		const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : new Date(Date.now() + DateUtils.daysToMs(DEFAULT_EXPIRATION_DAYS));

		const job = await this._jobRepository.create({
			data: {
				title: dto.title,
				description: dto.description,
				status: JobStatus.ACTIVE,
				contactName: dto.contact.name,
				contactWhatsapp: dto.contact.whatsappNumber,
				street: dto.location.street ?? null,
				neighborhood: dto.location.neighborhood ?? null,
				city: dto.location.city,
				state: dto.location.state,
				country: dto.location.country,
				type: dto.type,
				paymentAmount: dto.payment.amount,
				paymentRecurrence: dto.payment.recurrence,
				paymentCurrency: dto.payment.currency,
				expiresAt,
				categoryId: dto.categoryId,
			},
		});

		return JobOutputDto.fromDatabase(job, category.displayName);
	}
}
