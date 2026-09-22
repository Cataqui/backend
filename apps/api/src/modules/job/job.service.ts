import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "../../../generated/prisma/client.js";
import { AiTask } from "../ai/ai-task.enum";
import { AiService } from "../ai/ai.service";
import { LocationService } from "../location/location.service";
import { UserService } from "../user/user.service";
import { JobLocationConstants } from "./constants/job-location.constants";
import { JobContactNotFoundError } from "./errors/job-contact-not-found.error";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobIdempotencyConflictError } from "./errors/job-idempotency-conflict.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobDataDerivationPrompts } from "./prompts/job-data-derivation-prompts";
import { JobRepository } from "./repositories/job.repository";
import { CreateJobInputSchema } from "./schemas/create-job-input.schema";
import { JobContactOutputSchema } from "./schemas/job-contact-output.schema";
import { JobDerivedDataSchema } from "./schemas/job-derived-data.schema.js";
import { toPublicJobOutput } from "./schemas/public-job-output.mapper";
import { PublicJobOutputSchema } from "./schemas/public-job-output.schema";

@Injectable()
export class JobService {
	constructor(
		private readonly _jobRepository: JobRepository,
		private readonly _userService: UserService,
		private readonly _aiService: AiService,
		private readonly _locationService: LocationService,
	) {}

	async createJob(params: {
		dto: z.infer<typeof CreateJobInputSchema>;
		idempotencyKey: string;
		posterUserId: string;
	}): Promise<z.infer<typeof PublicJobOutputSchema>> {
		const requestHash = createHash("sha256").update(JSON.stringify(params.dto)).digest("hex");

		const existing = await this._jobRepository.findByIdempotencyKey({
			posterUserId: params.posterUserId,
			idempotencyKey: params.idempotencyKey,
		});

		if (existing) {
			if (existing.requestHash !== requestHash) throw new JobIdempotencyConflictError();
			return toPublicJobOutput(existing.job);
		}

		const derived = await this.getDerivedJobDataFromDescription({ description: params.dto.description });
		const contact = await this._userService.getOrAddContact({
			userId: params.posterUserId,
			contact: params.dto.contact,
		});
		const fuzzyLocation = this._locationService.fuzzCoordinate({
			latitude: params.dto.location.latitude,
			longitude: params.dto.location.longitude,
			minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
			maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
		});
		try {
			const created = await this._jobRepository.createJob({
				posterUserId: params.posterUserId,
				idempotencyKey: params.idempotencyKey,
				requestHash: requestHash,
				contactId: contact.contactId,
				description: params.dto.description,
				payment: params.dto.payment,
				title: derived.title,
				descriptionSummary: derived.descriptionSummary,
				location: params.dto.location,
				fuzzyLocation: fuzzyLocation,
			});
			return toPublicJobOutput(created);
		} catch (error) {
			if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
			const winner = await this._jobRepository.findByIdempotencyKey({
				posterUserId: params.posterUserId,
				idempotencyKey: params.idempotencyKey,
			});
			if (!winner) throw error;
			if (winner.requestHash !== requestHash) throw new JobIdempotencyConflictError();
			return toPublicJobOutput(winner.job);
		}
	}

	async getDerivedJobDataFromDescription(params: {
		description: string;
	}): Promise<{ title: string; descriptionSummary: string }> {
		let generatedJobData: unknown;
		try {
			generatedJobData = await this._aiService.generateObject({
				task: AiTask.DERIVE_JOB_DATA,
				system: JobDataDerivationPrompts.buildSystemPrompt(),
				prompt: JobDataDerivationPrompts.buildUserPrompt({ description: params.description }),
				schema: JobDerivedDataSchema,
				schemaDescription:
					"A concise title and complementary feed summary grounded exclusively in the supplied job description.",
				maxTokens: 10_000,
				abortSignal: AbortSignal.timeout(30_000),
			});
		} catch {
			throw new JobDataDerivationUnavailableError();
		}
		const parsed = JobDerivedDataSchema.safeParse(generatedJobData);
		if (!parsed.success) throw new JobDataDerivationUnavailableError();
		return { title: parsed.data.title, descriptionSummary: parsed.data.description_summary };
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
		return { contactMethod: contact.contactMethod, identifier: contact.identifier };
	}
}
