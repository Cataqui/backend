import { ILocationCoordinate } from "@/shared/utils/location/location-coordinate.interface";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { JobPaymentAmountPeriod, JobStatus, JobType } from "../../../generated/prisma/client.js";
import { LocationUtils } from "../../shared/utils/location/location.utils";
import { MapService } from "../map/map.service";
import { JobLocationConstants } from "./constants/job-location.constants";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { JobContactOutputDto } from "./dto/job-contact-output.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { CategoryNotFoundError } from "./errors/category-not-found.error";
import { InvalidJobTypePeriodError } from "./errors/invalid-job-type-period.error";
import { JobContactNotFoundError } from "./errors/job-contact-not-found.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobDescriptionService } from "./job-description.service";
import { JobCategoryRepository } from "./repositories/job-category.repository";
import { JobRepository } from "./repositories/job.repository";

@Injectable()
export class JobService {
	private readonly _logger = new Logger(JobService.name);

	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _jobCategoryRepository: JobCategoryRepository,
		private readonly _mapService: MapService,
		private readonly _jobDescriptionService: JobDescriptionService,
	) {}

	async getJob(params: { jobId: string; locale: string }): Promise<JobOutputDto> {
		const result = await this._jobRepository.findByIdLocalized({
			id: params.jobId,
			locale: params.locale,
		});
		if (!result) throw new JobNotFoundError();

		const mapConfig = await this._mapService.getConfig({ region: "BR" });
		return JobOutputDto.fromDatabase(result, result.categoryDisplayName, mapConfig);
	}

	async getJobContact(params: { contactId: string; jobId: string }): Promise<JobContactOutputDto> {
		const contact = await this._jobRepository.findContactByIdAndJobId({
			contactId: params.contactId,
			jobId: params.jobId,
		});

		if (!contact) throw new JobContactNotFoundError();

		return JobContactOutputDto.fromDatabase({
			contactMethod: contact.contactMethod,
			identifier: contact.identifier,
		});
	}

	async createJob({ dto, locale }: { dto: CreateJobRequestDto; locale: string }): Promise<JobOutputDto> {
		if (dto.type !== JobType.INDIVIDUAL && dto.payment.amountPeriod === JobPaymentAmountPeriod.SINGLE) {
			throw new InvalidJobTypePeriodError();
		}

		const [category, mapConfig] = await Promise.all([
			this._jobCategoryRepository.findByIdWithLocalizedName({
				id: dto.categoryId,
				locale,
			}),
			this._mapService.getConfig({ region: "BR" }),
		]);

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
				descriptionSummary: dto.description,
				status: JobStatus.ACTIVE,
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
			contact: {
				contactMethod: dto.contact.contactMethod,
				identifier: dto.contact.contactDetails.getIdentifier(),
			},
		});

		this._jobDescriptionService
			.improveDescriptionSummary({
				jobId: job.id,
				title: dto.title,
				description: dto.description,
			})
			.catch((error) => {
				this._logger.error(`Failed to generate description summary for job ${job.id}:`, error);
			});

		return JobOutputDto.fromDatabase(job, category.displayName, mapConfig);
	}
}
