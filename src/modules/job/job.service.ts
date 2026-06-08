import { HttpStatus, Injectable } from "@nestjs/common";
import { JobRepository } from "./repositories/job.repository";
import { JobCategoryRepository } from "./repositories/job-category.repository";
import { CategoryNotFoundError } from "./errors/category-not-found.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { InvalidJobTypePeriodError } from "./errors/invalid-job-type-period.error";
import { JobType, JobPaymentAmountPeriod, JobStatus } from "../../../generated/prisma/client.js";
import { JobOutputDto } from "./dto/job-output.dto";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { LocationUtils } from "../../shared/utils/location/location.utils";
import { JobLocationConstants } from "./job-location.constants";
import { ILocationCoordinate } from "@/shared/utils/location/location-coordinate.interface";

@Injectable()
export class JobService {
	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _jobCategoryRepository: JobCategoryRepository,
	) {}

	async getJob(params: { jobId: string; locale: string }): Promise<JobOutputDto> {
		const result = await this._jobRepository.findByIdLocalized({ id: params.jobId, locale: params.locale });
		if (!result) throw new JobNotFoundError();

		return JobOutputDto.fromDatabase(result, result.categoryDisplayName);
	}

	async createJob(dto: CreateJobRequestDto, locale: string): Promise<JobOutputDto> {
		if (dto.type !== JobType.INDIVIDUAL && dto.payment.amountPeriod === JobPaymentAmountPeriod.SINGLE) {
			throw new InvalidJobTypePeriodError();
		}

		const category = await this._jobCategoryRepository.findByIdWithLocalizedName({ id: dto.categoryId, locale });
		if (!category) throw new CategoryNotFoundError(HttpStatus.BAD_REQUEST);

		const fuzzyLocation: ILocationCoordinate = dto.location.street?.trim()
			? LocationUtils.fuzzLocationCoordinate({
					latitude: dto.location.latitude,
					longitude: dto.location.longitude,
					minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
					maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
				})
			: { latitude: dto.location.latitude, longitude: dto.location.longitude };

		const job = await this._jobRepository.create({
			locationPoint: {
				latitude: dto.location.latitude,
				longitude: dto.location.longitude,
			},
			data: {
				title: dto.title,
				description: dto.description,
				status: JobStatus.ACTIVE,
				contactName: dto.contact.name,
				contactPhoneNumber: dto.contact.phoneNumber,
				contactMethod: dto.contact.method,
				street: dto.location.street ?? null,
				neighborhood: dto.location.neighborhood,
				city: dto.location.city,
				state: dto.location.state,
				country: dto.location.country,
				fuzzyLatitude: fuzzyLocation.latitude,
				fuzzyLongitude: fuzzyLocation.longitude,
				type: dto.type,
				paymentType: dto.payment.type,
				paymentMinAmount: dto.payment.minAmount ?? null,
				paymentMaxAmount: dto.payment.maxAmount ?? null,
				paymentNote: dto.payment.note ?? null,
				paymentAmountPeriod: dto.payment.amountPeriod,
				paymentCurrency: dto.payment.currency,
				categoryId: dto.categoryId,
			},
		});

		return JobOutputDto.fromDatabase(job, category.displayName);
	}
}
