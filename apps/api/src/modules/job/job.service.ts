import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PaginatedResult, type PaginatedResult as PaginatedResultType } from "../../shared/results/paginated-result";
import { AiTask } from "../ai/ai-task.enum";
import { AiService } from "../ai/ai.service";
import { ContactService } from "../contact/contact.service";
import { LocationService } from "../location/location.service";
import { workerCall } from "../../platform/outbound/worker-call";
import { JobImagesUnavailableError } from "./errors/job-images-unavailable.error";
import { toFuzzyJobLocationOutput } from "./schemas/fuzzy-job-location-output.mapper";
import { JobLocationConstants } from "./constants/job-location.constants";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobIdempotencyConflictError } from "./errors/job-idempotency-conflict.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobDataDerivationPrompts } from "./prompts/job-data-derivation-prompts";
import { JobRepository } from "./repositories/job.repository";
import type { ContactOutputSchema } from "../contact/schemas/contact-output.schema";
import { CreateJobInputSchema } from "./schemas/create-job-input.schema";
import { JobDerivedDataSchema } from "./schemas/job-derived-data.schema.js";
import { UserJobSummaryOutputSchema } from "./schemas/user-job-summary-output.schema";
import { toUserJobOutput } from "./schemas/user-job-output.mapper";
import { UserJobOutputSchema } from "./schemas/user-job-output.schema";
import { toPublicJobOutput } from "./schemas/public-job-output.mapper";
import { PublicJobOutputSchema } from "./schemas/public-job-output.schema";
import { decodeUserJobsCursor, encodeUserJobsCursor } from "./utils/user-jobs-cursor.utils";

@Injectable()
export class JobService {
	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _contactService: ContactService,
		private readonly _aiService: AiService,
		private readonly _locationService: LocationService,
	) {}

	async getUserJob(params: { jobId: string; posterUserId: string }): Promise<z.infer<typeof UserJobOutputSchema>> {
		const job = await this._jobRepository.findUserJobById(params);
		if (job === null) throw new JobNotFoundError();
		return toUserJobOutput({
			job: job,
			location: toFuzzyJobLocationOutput({
				fuzzyLatitude: job.fuzzyLatitude,
				fuzzyLongitude: job.fuzzyLongitude,
				locationImageUrl: job.locationImageUrl,
			}),
		});
	}

	async getUserJobs(params: {
		posterUserId: string;
		cursor?: string | undefined;
	}): Promise<PaginatedResultType<z.infer<typeof UserJobSummaryOutputSchema>>> {
		const limit = 20;
		const cursor = params.cursor === undefined ? undefined : decodeUserJobsCursor({ cursor: params.cursor });
		const results = await this._jobRepository.findUserJobs({
			posterUserId: params.posterUserId,
			cursor: cursor,
			limit: limit + 1,
		});
		const hasMore = results.length > limit;
		const page = hasMore ? results.slice(0, limit) : results;
		const lastItem = page.at(-1);
		const nextCursor =
			hasMore && lastItem !== undefined
				? encodeUserJobsCursor({ createdAt: lastItem.createdAt.toISOString(), jobId: lastItem.id })
				: null;
		return PaginatedResult.create({
			data: page.map((job) => ({
				jobId: job.id,
				title: job.title,
				descriptionSummary: job.descriptionSummary,
				payment: job.payment,
				location: toFuzzyJobLocationOutput({
					fuzzyLatitude: job.fuzzyLatitude,
					fuzzyLongitude: job.fuzzyLongitude,
					locationImageUrl: job.locationImageUrl,
				}),
				status: job.status,
				createdAt: job.createdAt.toISOString(),
				updatedAt: job.updatedAt.toISOString(),
			})),
			pagination: { hasMore: hasMore, nextCursor: nextCursor },
		});
	}

	async createJob(params: {
		dto: z.infer<typeof CreateJobInputSchema>;
		idempotencyKey: string;
		posterUserId: string;
	}): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const requestHash = createHash("sha256").update(JSON.stringify(params.dto)).digest("hex");

		let reservation = await this._jobRepository.findByIdempotencyKey({
			posterUserId: params.posterUserId,
			idempotencyKey: params.idempotencyKey,
		});
		if (reservation === null) {
			reservation = await this._jobRepository.reservePostRequest({
				posterUserId: params.posterUserId,
				idempotencyKey: params.idempotencyKey,
				requestHash: requestHash,
				fuzzyLocation: this._locationService.fuzzCoordinate({
					latitude: params.dto.location.latitude,
					longitude: params.dto.location.longitude,
					minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
					maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
				}),
			});
		}
		if (reservation.requestHash !== requestHash) throw new JobIdempotencyConflictError();
		if (reservation.job !== null) {
			return toPublicJobOutput({
				job: reservation.job,
				location: toFuzzyJobLocationOutput({
					fuzzyLatitude: reservation.job.fuzzyLatitude,
					fuzzyLongitude: reservation.job.fuzzyLongitude,
					locationImageUrl: reservation.job.locationImageUrl,
				}),
			});
		}
		const [derived, imageUrl, contact] = await Promise.all([
			this.getDerivedJobDataFromDescription({ description: params.dto.description }),
			this._generateLocationImage({
				latitude: reservation.fuzzyLatitude.toNumber(),
				longitude: reservation.fuzzyLongitude.toNumber(),
			}),
			this._contactService.getOrAddContact({
				userId: params.posterUserId,
				contact: params.dto.contact,
			}),
		]);
		const created = await this._jobRepository.createJob({
			posterUserId: params.posterUserId,
			postRequestId: reservation.id,
			contactId: contact.contactId,
			description: params.dto.description,
			payment: derived.payment,
			title: derived.title,
			descriptionSummary: derived.descriptionSummary,
			location: params.dto.location,
			locationImageUrl: imageUrl,
		});
		return toPublicJobOutput({
			job: created,
			location: toFuzzyJobLocationOutput({
				fuzzyLatitude: created.fuzzyLatitude,
				fuzzyLongitude: created.fuzzyLongitude,
				locationImageUrl: created.locationImageUrl,
			}),
		});
	}

	async getDerivedJobDataFromDescription(params: {
		description: string;
	}): Promise<{ title: string; descriptionSummary: string; payment: string | null }> {
		let generatedJobData: unknown;
		try {
			generatedJobData = await this._aiService.generateObject({
				task: AiTask.DERIVE_JOB_DATA,
				system: JobDataDerivationPrompts.buildSystemPrompt(),
				prompt: JobDataDerivationPrompts.buildUserPrompt({ description: params.description }),
				schema: JobDerivedDataSchema,
				schemaDescription:
					"A concise title, complementary feed summary, and nullable payment grounded exclusively in the supplied job description.",
				maxTokens: 10_000,
				abortSignal: AbortSignal.timeout(30_000),
			});
		} catch {
			throw new JobDataDerivationUnavailableError();
		}
		const parsed = JobDerivedDataSchema.safeParse(generatedJobData);
		if (!parsed.success) throw new JobDataDerivationUnavailableError();
		return {
			title: parsed.data.title,
			descriptionSummary: parsed.data.description_summary,
			payment: parsed.data.payment === "" ? null : parsed.data.payment,
		};
	}

	async getPublicJob(params: { jobId: string }): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const job = await this._jobRepository.findPublicById({ jobId: params.jobId });
		if (!job) throw new JobNotFoundError();
		return toPublicJobOutput({
			job: job,
			location: toFuzzyJobLocationOutput({
				fuzzyLatitude: job.fuzzyLatitude,
				fuzzyLongitude: job.fuzzyLongitude,
				locationImageUrl: job.locationImageUrl,
			}),
		});
	}

	async archiveJob(params: { jobId: string; posterUserId: string }): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const job = await this._jobRepository.archiveOwnedJob(params);
		if (job === null) throw new JobNotFoundError();
		return toPublicJobOutput({
			job: job,
			location: toFuzzyJobLocationOutput({
				fuzzyLatitude: job.fuzzyLatitude,
				fuzzyLongitude: job.fuzzyLongitude,
				locationImageUrl: job.locationImageUrl,
			}),
		});
	}

	async activateJob(params: { jobId: string; posterUserId: string }): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const job = await this._jobRepository.activateOwnedJob(params);
		if (job === null) throw new JobNotFoundError();
		return toPublicJobOutput({
			job: job,
			location: toFuzzyJobLocationOutput({
				fuzzyLatitude: job.fuzzyLatitude,
				fuzzyLongitude: job.fuzzyLongitude,
				locationImageUrl: job.locationImageUrl,
			}),
		});
	}

	async getJobContact(params: { jobId: string; contactId: string }): Promise<z.infer<typeof ContactOutputSchema>> {
		const contact = await this._jobRepository.findActiveJobContact(params);
		if (contact === null) throw new JobNotFoundError();
		return { method: contact.contactMethod, identifier: contact.identifier };
	}

	private async _generateLocationImage(params: { latitude: number; longitude: number }): Promise<string> {
		const result = await workerCall({
			worker: "maps",
			method: "generateStaticMaps",
			input: { latitude: params.latitude, longitude: params.longitude },
			signal: AbortSignal.timeout(45_000),
		}).catch(() => {
			throw new JobImagesUnavailableError();
		});
		if (result.kind === "ready") return result.asset.url;
		throw new JobImagesUnavailableError();
	}
}
