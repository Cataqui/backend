import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ILocationCoordinate } from "@/shared/utils/location/location-coordinate.interface";
import { JobPaymentAmountPeriod, JobStatus, JobType } from "../../../generated/prisma/client.js";
import { AiGatewayJobTypeModel } from "../../core/ai/ai-gateway-job-type-model";
import { AiGatewayService } from "../../core/ai/ai-gateway-service";
import { LocationUtils } from "../../shared/utils/location/location.utils";
import { MapService } from "../map/map.service";
import { CreateJobRequestDto } from "./dto/create-job-request.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { CategoryNotFoundError } from "./errors/category-not-found.error";
import { InvalidJobTypePeriodError } from "./errors/invalid-job-type-period.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobLocationConstants } from "./job-location.constants";
import { JobDescriptionSummaryPrompts } from "./prompts/job-description-summary";
import { JobRepository } from "./repositories/job.repository";
import { JobCategoryRepository } from "./repositories/job-category.repository";

@Injectable()
export class JobService {
	private readonly _logger = new Logger(JobService.name);

	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _jobCategoryRepository: JobCategoryRepository,
		private readonly _mapService: MapService,
		private readonly _aiGatewayService: AiGatewayService,
	) {}

	async getJob(params: { jobId: string; locale: string }): Promise<JobOutputDto> {
		const result = await this._jobRepository.findByIdLocalized({ id: params.jobId, locale: params.locale });
		if (!result) throw new JobNotFoundError();

		const mapConfig = await this._mapService.getConfig({ region: "BR" });
		return JobOutputDto.fromDatabase(result, result.categoryDisplayName, mapConfig);
	}

	async createJob(dto: CreateJobRequestDto, locale: string): Promise<JobOutputDto> {
		if (dto.type !== JobType.INDIVIDUAL && dto.payment.amountPeriod === JobPaymentAmountPeriod.SINGLE) {
			throw new InvalidJobTypePeriodError();
		}

		const [category, mapConfig] = await Promise.all([
			this._jobCategoryRepository.findByIdWithLocalizedName({ id: dto.categoryId, locale }),
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
				descriptionSummary: dto.description.substring(0, 200),
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

		this._improveDescriptionSummary(job.id, dto.description).catch((error) => {
			this._logger.error(`Failed to generate description summary for job ${job.id}:`, error);
		});

		return JobOutputDto.fromDatabase(job, category.displayName, mapConfig);
	}

	private async _improveDescriptionSummary(jobId: string, description: string): Promise<void> {
		const rawSummary = await this._aiGatewayService.generateText({
			jobType: AiGatewayJobTypeModel.SUMMARIZE,
			system: JobDescriptionSummaryPrompts.buildSystemPrompt(),
			prompt: JobDescriptionSummaryPrompts.buildUserPrompt(description),
			temperature: 0,
		});

		const trimmed = rawSummary.trim();

		if (trimmed.length === 0) return;
		const summary = trimmed.length > 100 ? trimmed.substring(0, 100) : trimmed;

		await this._jobRepository.updateDescriptionSummary({ jobId, summary });
	}
}
