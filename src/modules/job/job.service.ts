import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { JobPaymentAmountPeriod, JobStatus, JobType, type Prisma } from "../../../generated/prisma/client.js";
import { outboundCall } from "../../platform/cloudflare/containers/api/outbound/api-container-outbound";
import { AiTask } from "../ai/ai-task.enum";
import { AiService } from "../ai/ai.service";
import { LocationService } from "../location/location.service";
import { UserService } from "../user/user.service";
import { JobLocationConstants } from "./constants/job-location.constants";
import { InvalidEmploymentPaymentError } from "./errors/invalid-job-type-period.error";
import { JobAlreadyPublishedError } from "./errors/job-already-published.error";
import { JobContactNotFoundError } from "./errors/job-contact-not-found.error";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobDraftIncompleteError } from "./errors/job-draft-incomplete.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobDataDerivationPrompts } from "./prompts/job-data-derivation-prompts";
import { JobRepository } from "./repositories/job.repository";
import { CreateJobDraftInputSchema } from "./schemas/create-job-draft-input.schema";
import { toDraftJobOutput } from "./schemas/draft-job-output.mapper";
import { DraftJobOutputSchema } from "./schemas/draft-job-output.schema";
import { JobContactOutputSchema } from "./schemas/job-contact-output.schema";
import { JobDerivedDataSchema } from "./schemas/job-derived-data.schema.js";
import { toPublicJobOutput } from "./schemas/public-job-output.mapper";
import { PublicJobOutputSchema } from "./schemas/public-job-output.schema";
import { UpdateJobInputSchema } from "./schemas/update-job-input.schema";

@Injectable()
export class JobService {
	private readonly _logger = new Logger(JobService.name);

	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _userService: UserService,
		private readonly _aiService: AiService,
		private readonly _locationService: LocationService,
	) {}

	async createDraft(params: {
		dto: z.infer<typeof CreateJobDraftInputSchema>;
		posterUserId: string;
	}): Promise<z.infer<typeof DraftJobOutputSchema>> {
		const jobDraft = await this._jobRepository.createDraft({
			description: params.dto.description,
			posterUserId: params.posterUserId,
		});

		await this._enqueueJobDataDerivation({ jobId: jobDraft.id });

		return toDraftJobOutput(jobDraft);
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

	async getDerivedJobDataFromDescription(params: {
		description: string;
	}): Promise<{ title: string; descriptionSummary: string }> {
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
				// The output budget also covers hidden thinking tokens; the Zod schema constrains the visible fields.
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

	async getPublicJob(params: { jobId: string }): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const job = await this._jobRepository.findPublicById({ jobId: params.jobId });
		if (!job) throw new JobNotFoundError();

		return toPublicJobOutput(job);
	}

	async getActiveJobContact(params: {
		contactId: string;
		jobId: string;
	}): Promise<z.infer<typeof JobContactOutputSchema>> {
		const contact = await this._jobRepository.findActiveJobContact({
			contactId: params.contactId,
			jobId: params.jobId,
		});

		if (!contact) throw new JobContactNotFoundError();

		return {
			contactMethod: contact.contactMethod,
			identifier: contact.identifier,
		};
	}

	async updateDraft(params: {
		jobId: string;
		updatedDto: z.infer<typeof UpdateJobInputSchema>;
		posterUserId: string;
	}): Promise<z.infer<typeof DraftJobOutputSchema>> {
		const existingDraft = await this._jobRepository.findDraftByIdFromPoster({
			jobId: params.jobId,
			posterUserId: params.posterUserId,
		});

		if (!existingDraft) throw new JobNotFoundError();

		const hasDescriptionChanged =
			params.updatedDto.description !== undefined && params.updatedDto.description !== existingDraft.description;

		const contactId =
			params.updatedDto.contact === undefined
				? undefined
				: (
						await this._userService.getOrAddContact({
							userId: params.posterUserId,
							contact: params.updatedDto.contact,
						})
					).contactId;

		const preparedUpdate = this._buildJobUpdateData({
			existingJob: existingDraft,
			updatedDto: params.updatedDto,
			contactId: contactId,
		});

		if (hasDescriptionChanged) {
			preparedUpdate.data.title = null;
			preparedUpdate.data.descriptionSummary = null;
		}

		const updatedDraft = await this._jobRepository.update({
			jobId: params.jobId,
			posterUserId: params.posterUserId,
			data: preparedUpdate.data,
			...(preparedUpdate.locationPoint === undefined ? {} : { locationPoint: preparedUpdate.locationPoint }),
		});

		if (hasDescriptionChanged) await this._enqueueJobDataDerivation({ jobId: params.jobId });

		return toDraftJobOutput(updatedDraft);
	}

	async updatePublicJob(params: {
		jobId: string;
		updatedDto: z.infer<typeof UpdateJobInputSchema>;
		posterUserId: string;
	}): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const existingPublicJob = await this._jobRepository.findPublicByIdFromPoster({
			jobId: params.jobId,
			posterUserId: params.posterUserId,
		});

		if (!existingPublicJob) throw new JobNotFoundError();

		const updatedDescription = params.updatedDto.description;
		const hasDescriptionChanged =
			updatedDescription !== undefined && updatedDescription !== existingPublicJob.description;
		let derivedJobData: { title: string; descriptionSummary: string } | undefined;

		if (hasDescriptionChanged) {
			derivedJobData = await this.getDerivedJobDataFromDescription({
				description: updatedDescription,
			});
		}

		const contactId =
			params.updatedDto.contact === undefined
				? undefined
				: (
						await this._userService.getOrAddContact({
							userId: params.posterUserId,
							contact: params.updatedDto.contact,
						})
					).contactId;

		const preparedUpdate = this._buildJobUpdateData({
			existingJob: existingPublicJob,
			updatedDto: params.updatedDto,
			contactId: contactId,
		});

		if (derivedJobData !== undefined) {
			preparedUpdate.data.title = derivedJobData.title;
			preparedUpdate.data.descriptionSummary = derivedJobData.descriptionSummary;
		}

		const updatedPublicJob = await this._jobRepository.update({
			jobId: params.jobId,
			posterUserId: params.posterUserId,
			data: preparedUpdate.data,
			...(preparedUpdate.locationPoint === undefined ? {} : { locationPoint: preparedUpdate.locationPoint }),
		});

		return toPublicJobOutput(updatedPublicJob);
	}

	async publishJob(params: { jobId: string; posterUserId: string }): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const existingJob = await this._jobRepository.findByIdFromPoster({
			jobId: params.jobId,
			posterUserId: params.posterUserId,
		});

		if (!existingJob) throw new JobNotFoundError();
		if (existingJob.status === JobStatus.ACTIVE) return toPublicJobOutput(existingJob);
		if (existingJob.status === JobStatus.CLOSED) throw new JobAlreadyPublishedError();

		const publicationReadiness = PublicJobOutputSchema.safeParse({
			...toDraftJobOutput(existingJob),
			status: JobStatus.ACTIVE,
		});

		if (!publicationReadiness.success) {
			const ignoredServerFields = new Set<string>(["title", "descriptionSummary", "status"] satisfies Array<
				keyof z.infer<typeof DraftJobOutputSchema>
			>);

			const publicationErrorsByField = z.treeifyError(publicationReadiness.error).properties ?? {};

			const missingFields = [
				...new Set(
					Object.entries(publicationErrorsByField).flatMap(([field, errors]) => {
						if (ignoredServerFields.has(field) || errors.errors.length === 0) return [];
						if (field === "contactReference") return ["contact"];
						return [field];
					}),
				),
			];

			if (missingFields.length > 0) throw new JobDraftIncompleteError({ missingFields: missingFields });
		}

		await this._deriveMissingPublishData({ draft: existingJob, posterUserId: params.posterUserId });

		const publishedJob = await this._jobRepository.publishDraft({
			jobId: params.jobId,
			posterUserId: params.posterUserId,
		});

		return toPublicJobOutput(publishedJob);
	}

	private async _deriveMissingPublishData(params: {
		draft: Prisma.JobGetPayload<{ include: { contact: true } }>;
		posterUserId: string;
	}): Promise<void> {
		if (params.draft.title?.trim() && params.draft.descriptionSummary?.trim()) {
			return;
		}

		const derivedJobData = await this.getDerivedJobDataFromDescription({
			description: params.draft.description,
		});

		await this._jobRepository.update({
			jobId: params.draft.id,
			posterUserId: params.posterUserId,
			data: derivedJobData,
		});
	}

	private async _enqueueJobDataDerivation(params: { jobId: string }): Promise<void> {
		let status: number | null = null;

		try {
			const response = await outboundCall({
				host: "derive-job-data.queue",
				body: { jobId: params.jobId },
			});

			if (response.ok) return;

			status = response.status;
		} catch {
			// Transport failures do not have an HTTP response status.
		}

		this._logger.error({
			event: "job_data_derivation.queue_publish_failed",
			jobId: params.jobId,
			status: status,
		});
	}

	private _buildJobUpdateData(params: {
		existingJob: Prisma.JobGetPayload<{ include: { contact: true } }>;
		updatedDto: z.infer<typeof UpdateJobInputSchema>;
		contactId: string | undefined;
	}): {
		data: Prisma.JobUncheckedUpdateInput;
		locationPoint?: { latitude: number; longitude: number };
	} {
		const resultingType = params.updatedDto.type ?? params.existingJob.type;
		const resultingAmountPeriod = params.updatedDto.payment?.amountPeriod ?? params.existingJob.paymentAmountPeriod;

		if (resultingType === JobType.EMPLOYMENT && resultingAmountPeriod === JobPaymentAmountPeriod.SINGLE) {
			throw new InvalidEmploymentPaymentError();
		}

		const data: Prisma.JobUncheckedUpdateInput = {};

		if (params.updatedDto.description !== undefined) data.description = params.updatedDto.description;
		if (params.updatedDto.type !== undefined) data.type = params.updatedDto.type;
		if (params.updatedDto.location !== undefined) {
			data.street = params.updatedDto.location.street ?? null;
			data.neighborhood = params.updatedDto.location.neighborhood;
			data.city = params.updatedDto.location.city;
			data.state = params.updatedDto.location.state;
			data.country = params.updatedDto.location.country;

			const fuzzyLocation = this._locationService.fuzzCoordinate({
				latitude: params.updatedDto.location.latitude,
				longitude: params.updatedDto.location.longitude,
				minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
				maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
			});
			data.fuzzyLatitude = fuzzyLocation.latitude;
			data.fuzzyLongitude = fuzzyLocation.longitude;
		}

		if (params.updatedDto.payment !== undefined) {
			data.paymentType = params.updatedDto.payment.type;
			data.paymentMinAmount = params.updatedDto.payment.minAmount ?? null;
			data.paymentMaxAmount = params.updatedDto.payment.maxAmount ?? null;
			data.paymentNote = params.updatedDto.payment.note ?? null;
			data.paymentAmountPeriod = params.updatedDto.payment.amountPeriod;
			data.paymentCurrency = params.updatedDto.payment.currency;
		}

		if (params.contactId !== undefined) data.contactId = params.contactId;

		return {
			data: data,
			...(params.updatedDto.location === undefined
				? {}
				: {
						locationPoint: {
							latitude: params.updatedDto.location.latitude,
							longitude: params.updatedDto.location.longitude,
						},
					}),
		};
	}
}
