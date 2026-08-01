import { Injectable } from "@nestjs/common";
import { JobPaymentAmountPeriod, JobStatus, JobType, type Prisma } from "../../../generated/prisma/client.js";
import { AiTask } from "../ai/ai-task.enum";
import { AiService } from "../ai/ai.service";
import { MapService } from "../map/map.service";
import { JobLocationConstants } from "./constants/job-location.constants";
import { RequiredToPublishMetadata } from "./decorators/required-to-publish.decorator";
import { DeriveJobDataPublisher } from "./derive-job-data.publisher";
import { CreateJobDraftRequestDto } from "./dto/create-job-draft-request.dto";
import { JobContactOutputDto } from "./dto/job-contact-output.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { UpdateJobRequestDto } from "./dto/update-job-request.dto";
import { InvalidEmploymentPaymentError } from "./errors/invalid-job-type-period.error";
import { JobAlreadyPublishedError } from "./errors/job-already-published.error";
import { JobContactNotFoundError } from "./errors/job-contact-not-found.error";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobDraftIncompleteError } from "./errors/job-draft-incomplete.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobDataDerivationPrompts } from "./prompts/job-data-derivation-prompts";
import { JobRepository } from "./repositories/job.repository";
import { JobDerivedDataSchema } from "./schemas/job-derived-data.schema.js";

@Injectable()
export class JobService {
	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _aiService: AiService,
		private readonly _deriveJobDataPublisher: DeriveJobDataPublisher,
		private readonly _mapService: MapService,
	) {}

	async createDraft(params: { dto: CreateJobDraftRequestDto }): Promise<JobOutputDto> {
		const jobDraft = await this._jobRepository.createDraft({
			description: params.dto.description,
		});

		await this._deriveJobDataPublisher.publish({ jobId: jobDraft.id });

		return JobOutputDto.fromDatabase(jobDraft);
	}

	async deriveDataForJob(params: { jobId: string }): Promise<void> {
		const job = await this._jobRepository.findById({ jobId: params.jobId });
		if (job === null) return;

		const derivedJobData = await this.getDerivedJobDataFromDescription({
			description: job.description,
		});

		await this._jobRepository.updateDerivedJobDataIfDescriptionUnchanged({
			jobId: job.id,
			description: job.description,
			title: derivedJobData.title,
			descriptionSummary: derivedJobData.descriptionSummary,
		});
	}

	async getDerivedJobDataFromDescription(params: { description: string }): Promise<{
		[KEY in keyof Pick<JobOutputDto, "title" | "descriptionSummary">]: NonNullable<JobOutputDto[KEY]>;
	}> {
		let generatedJobData: unknown;

		try {
			generatedJobData = await this._aiService.generateObject({
				task: AiTask.DERIVE_JOB_DATA,
				system: JobDataDerivationPrompts.buildSystemPrompt(),
				prompt: JobDataDerivationPrompts.buildUserPrompt({
					description: params.description,
				}),
				schema: JobDerivedDataSchema,
				schemaDescription:
					"A concise title and complementary feed summary grounded exclusively in the supplied job description.",
				maxTokens: 10_000,
				abortSignal: AbortSignal.timeout(30_000),
			});
		} catch {
			throw new JobDataDerivationUnavailableError();
		}

		const parsedJobData = JobDerivedDataSchema.safeParse(generatedJobData);
		if (!parsedJobData.success) throw new JobDataDerivationUnavailableError();

		return {
			title: parsedJobData.data.title,
			descriptionSummary: parsedJobData.data.description_summary,
		};
	}

	async getJob(params: { jobId: string; locale: string }): Promise<JobOutputDto> {
		const job = await this._jobRepository.findById({ jobId: params.jobId });
		if (!job) throw new JobNotFoundError();

		return JobOutputDto.fromDatabase(job);
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

	async updateJob(params: { jobId: string; updatedDto: UpdateJobRequestDto; locale: string }): Promise<JobOutputDto> {
		const existingJob = await this._jobRepository.findById({ jobId: params.jobId });
		if (!existingJob) throw new JobNotFoundError();

		const { contact, description, location, payment, type } = params.updatedDto;

		const resultingType = type ?? existingJob.type;
		const resultingAmountPeriod = payment?.amountPeriod ?? existingJob.paymentAmountPeriod;

		if (resultingType === JobType.EMPLOYMENT && resultingAmountPeriod === JobPaymentAmountPeriod.SINGLE) {
			throw new InvalidEmploymentPaymentError();
		}

		let updateData = this._buildJobUpdateData({
			description: description,
			location: location,
			payment: payment,
			type: type,
		});

		const fuzzyLocation = location ? this._buildFuzzyLocation({ location: location }) : null;

		updateData = {
			...updateData,
			...(fuzzyLocation && {
				fuzzyLatitude: fuzzyLocation.latitude,
				fuzzyLongitude: fuzzyLocation.longitude,
			}),
		};

		await this._jobRepository.update({
			jobId: params.jobId,
			data: updateData,

			...(contact && {
				contact: {
					contactMethod: contact.contactMethod,
					identifier: contact.identifier,
				},
			}),
			...(location && {
				locationPoint: {
					latitude: location.latitude,
					longitude: location.longitude,
				},
			}),
		});

		if (description !== undefined) await this._deriveJobDataPublisher.publish({ jobId: params.jobId });
		return this.getJob({ jobId: params.jobId, locale: params.locale });
	}

	async publishJob(params: { jobId: string; locale: string }): Promise<JobOutputDto> {
		const existingDraft = await this._jobRepository.findById({ jobId: params.jobId });

		if (!existingDraft) throw new JobNotFoundError();
		if (existingDraft.status !== JobStatus.DRAFT) throw new JobAlreadyPublishedError();

		const updatedDraft = await this.deriveMissingPublishData({ draft: existingDraft });
		const updatedDraftJobOutputDto = JobOutputDto.fromDatabase(updatedDraft);
		this._verifyRequiredPublicationFields({ job: updatedDraftJobOutputDto });

		const publishedJob = await this._jobRepository.publishDraft({ jobId: params.jobId });
		return JobOutputDto.fromDatabase(publishedJob);
	}

	private async deriveMissingPublishData<
		DRAFT extends { id: string; title: string | null; description: string; descriptionSummary: string | null },
	>(params: { draft: DRAFT }): Promise<DRAFT & { title: string; descriptionSummary: string }> {
		if (params.draft.title?.trim() && params.draft.descriptionSummary?.trim()) {
			return {
				...params.draft,
				title: params.draft.title,
				descriptionSummary: params.draft.descriptionSummary,
			};
		}

		const derivedJobData = await this.getDerivedJobDataFromDescription({
			description: params.draft.description,
		});

		await this._jobRepository.update({
			jobId: params.draft.id,
			data: derivedJobData,
		});

		return {
			...params.draft,
			title: derivedJobData.title,
			descriptionSummary: derivedJobData.descriptionSummary,
		};
	}

	private _buildJobUpdateData(params: {
		description: UpdateJobRequestDto["description"];
		location: UpdateJobRequestDto["location"];
		payment: UpdateJobRequestDto["payment"];
		type: UpdateJobRequestDto["type"];
	}): Prisma.JobUncheckedUpdateInput {
		const data: Prisma.JobUncheckedUpdateInput = {};

		if (params.description !== undefined) data.description = params.description;
		if (params.type !== undefined) data.type = params.type;
		if (params.location !== undefined) {
			data.street = params.location.street ?? null;
			data.neighborhood = params.location.neighborhood;
			data.city = params.location.city;
			data.state = params.location.state;
			data.country = params.location.country;
		}

		if (params.payment !== undefined) {
			data.paymentType = params.payment.type;
			data.paymentMinAmount = params.payment.minAmount ?? null;
			data.paymentMaxAmount = params.payment.maxAmount ?? null;
			data.paymentNote = params.payment.note ?? null;
			data.paymentAmountPeriod = params.payment.amountPeriod;
			data.paymentCurrency = params.payment.currency;
		}

		return data;
	}

	private _buildFuzzyLocation(params: { location: NonNullable<UpdateJobRequestDto["location"]> }): {
		latitude: number;
		longitude: number;
	} {
		if (!params.location.street?.trim()) {
			return { latitude: params.location.latitude, longitude: params.location.longitude };
		}

		return this._mapService.fuzzLocationCoordinate({
			latitude: params.location.latitude,
			longitude: params.location.longitude,
			minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
			maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
		});
	}

	private _verifyRequiredPublicationFields(params: { job: JobOutputDto }): void {
		const missingFields = RequiredToPublishMetadata.getFields({ dtoClass: JobOutputDto })
			.filter(({ propertyName }) => {
				const value = params.job[propertyName];
				return value === null || value === undefined || (typeof value === "string" && value.trim().length === 0);
			})
			.map(({ publicFieldName }) => publicFieldName);

		if (missingFields.length > 0) throw new JobDraftIncompleteError({ missingFields: missingFields });
	}
}
