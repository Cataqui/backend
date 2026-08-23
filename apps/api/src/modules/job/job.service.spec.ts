import { Test } from "@nestjs/testing";
import type { z } from "zod";
import {
	JobContactMethod,
	JobPaymentAmountPeriod,
	JobPaymentType,
	JobStatus,
	JobType,
} from "../../../generated/prisma/client.js";
import { AiService } from "../ai/ai.service";
import { LocationService } from "../location/location.service";
import { UserService } from "../user/user.service";
import { JobLocationConstants } from "./constants/job-location.constants";
import { InvalidEmploymentPaymentError } from "./errors/invalid-job-type-period.error";
import { JobAlreadyPublishedError } from "./errors/job-already-published.error";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobDraftIncompleteError } from "./errors/job-draft-incomplete.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";
import { PublicJobOutputSchema } from "./schemas/public-job-output.schema";
import { UpdateJobInputSchema } from "./schemas/update-job-input.schema";

const outboundCallMock = vi.hoisted(() => vi.fn());

vi.mock("../../platform/cloudflare/containers/api/outbound/api-container-outbound", () => ({
	outboundCall: outboundCallMock,
}));

/* eslint-disable @typescript-eslint/unbound-method */

const createdAt = new Date("2026-07-30T12:00:00.000Z");
const posterUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const contact = {
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	userId: posterUserId,
	contactMethod: JobContactMethod.WHATSAPP,
	identifier: "+5511999999999",
	createdAt: createdAt,
};
const completeJob = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	posterUserId: posterUserId,
	contactId: contact.id,
	title: "Auxiliar de cozinha",
	description: "Descrição completa da oportunidade.",
	descriptionSummary: "Descrição completa da oportunidade.",
	contact: contact,
	locationPoint: null,
	fuzzyLatitude: { toNumber: (): number => -23.55 },
	fuzzyLongitude: { toNumber: (): number => -46.63 },
	status: JobStatus.DRAFT,
	type: JobType.EMPLOYMENT,
	paymentType: JobPaymentType.FIXED,
	paymentMinAmount: { toNumber: (): number => 2100 },
	paymentMaxAmount: null,
	paymentNote: null,
	paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
	paymentCurrency: "BRL",
	createdAt: createdAt,
	updatedAt: createdAt,
};
function createCompleteUpdateDto(): z.infer<typeof UpdateJobInputSchema> {
	return Object.assign(
		{},
		{
			description: completeJob.description,
			contact: Object.assign(
				{},
				{
					contactMethod: JobContactMethod.WHATSAPP,
					identifier: "+5511999999999",
				},
			),
			location: Object.assign(
				{},
				{
					latitude: -23.55,
					longitude: -46.63,
				},
			),
			type: JobType.EMPLOYMENT,
			payment: Object.assign(
				{},
				{
					type: JobPaymentType.FIXED,
					minAmount: 2100,
					amountPeriod: JobPaymentAmountPeriod.MONTHLY,
					currency: "BRL",
				},
			),
		},
	);
}

describe("JobService", () => {
	let service: JobService;
	let jobRepository: {
		createDraft: ReturnType<typeof vi.fn>;
		findByIdFromPoster: ReturnType<typeof vi.fn>;
		findDraftByIdFromPoster: ReturnType<typeof vi.fn>;
		findPublicByIdFromPoster: ReturnType<typeof vi.fn>;
		findPublicById: ReturnType<typeof vi.fn>;
		findActiveJobContact: ReturnType<typeof vi.fn>;
		updateDerivedJobDataIfDescriptionUnchanged: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		publishDraft: ReturnType<typeof vi.fn>;
	};
	let userService: { getOrAddContact: ReturnType<typeof vi.fn> };
	let aiService: { generateObject: ReturnType<typeof vi.fn> };
	let locationService: { fuzzCoordinate: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		outboundCallMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
		const findOwnedJob = vi.fn().mockResolvedValue(null);
		jobRepository = {
			createDraft: vi.fn(),
			findByIdFromPoster: findOwnedJob,
			findDraftByIdFromPoster: findOwnedJob,
			findPublicByIdFromPoster: findOwnedJob,
			findPublicById: vi.fn().mockResolvedValue(null),
			findActiveJobContact: vi.fn().mockResolvedValue(null),
			updateDerivedJobDataIfDescriptionUnchanged: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(completeJob),
			publishDraft: vi.fn(),
		};
		userService = {
			getOrAddContact: vi.fn().mockResolvedValue({
				contactId: contact.id,
				contactMethod: contact.contactMethod,
				identifier: contact.identifier,
			}),
		};
		aiService = {
			generateObject: vi.fn().mockResolvedValue({
				title: completeJob.title,
				description_summary: completeJob.descriptionSummary,
			}),
		};
		locationService = {
			fuzzCoordinate: vi.fn().mockReturnValue({ latitude: -23.551, longitude: -46.631 }),
		};

		const module = await Test.createTestingModule({
			providers: [
				JobService,
				{ provide: JobRepository, useValue: jobRepository },
				{ provide: UserService, useValue: userService },
				{ provide: AiService, useValue: aiService },
				{ provide: LocationService, useValue: locationService },
			],
		}).compile();

		service = module.get(JobService);
	});

	it("should return a public job", async () => {
		jobRepository.findPublicById.mockResolvedValue({
			...completeJob,
			status: JobStatus.ACTIVE,
		});

		const result = await service.getPublicJob({ jobId: completeJob.id });

		expect(PublicJobOutputSchema.safeParse(result).success).toBe(true);
	});

	it("should hide a draft from public job lookup", async () => {
		jobRepository.findPublicById.mockResolvedValue(null);

		await expect(service.getPublicJob({ jobId: completeJob.id })).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("should return not found when no public job exists", async () => {
		await expect(service.getPublicJob({ jobId: completeJob.id })).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("should return a published job contact", async () => {
		jobRepository.findActiveJobContact.mockResolvedValue(contact);

		const result = await service.getActiveJobContact({ contactId: contact.id, jobId: completeJob.id });

		expect(result.identifier).toBe("+5511999999999");
	});

	it("should reject an unavailable job contact", async () => {
		await expect(service.getActiveJobContact({ contactId: contact.id, jobId: completeJob.id })).rejects.toThrow(
			"contact",
		);
	});

	it("should reject updates for an unknown or unowned job", async () => {
		await expect(
			service.updateDraft({
				jobId: completeJob.id,
				posterUserId: posterUserId,
				updatedDto: Object.assign({}, { description: "Nova descrição da oportunidade." }),
			}),
		).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("should reject the draft update route when the owned job is already public", async () => {
		jobRepository.findDraftByIdFromPoster.mockResolvedValue(null);

		await expect(
			service.updateDraft({
				jobId: completeJob.id,
				posterUserId: posterUserId,
				updatedDto: { description: "Nova descrição da oportunidade." },
			}),
		).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("should reject the public update route when the owned job is still a draft", async () => {
		jobRepository.findPublicByIdFromPoster.mockResolvedValue(null);

		await expect(
			service.updatePublicJob({
				jobId: completeJob.id,
				posterUserId: posterUserId,
				updatedDto: { description: "Nova descrição da oportunidade." },
			}),
		).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("should not mutate a job that the authenticated user does not own", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(null);

		await service
			.updateDraft({
				jobId: completeJob.id,
				posterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				updatedDto: Object.assign({}, { description: "Tentativa de alteração sem autorização." }),
			})
			.catch(() => undefined);

		expect(jobRepository.update).not.toHaveBeenCalled();
	});

	it("should persist supplied draft fields, contact, and real location together", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);

		await service.updateDraft({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: createCompleteUpdateDto(),
		});

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				jobId: completeJob.id,
				data: expect.objectContaining({ contactId: contact.id }),
				locationPoint: {
					latitude: -23.55,
					longitude: -46.63,
				},
			}),
		);
	});

	it("should create a new immutable contact instead of editing the previous contact", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		userService.getOrAddContact.mockResolvedValue({
			contactId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			contactMethod: contact.contactMethod,
			identifier: "@new.contact",
		});

		await service.updateDraft({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: {
				contact: { contactMethod: JobContactMethod.WHATSAPP, identifier: "@new.contact" },
			},
		});

		expect(userService.getOrAddContact).toHaveBeenCalledWith({
			userId: posterUserId,
			contact: {
				contactMethod: JobContactMethod.WHATSAPP,
				identifier: "@new.contact",
			},
		});
	});

	it("should ask the location service to fuzz edited coordinates", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);

		await service.updateDraft({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: createCompleteUpdateDto(),
		});

		expect(locationService.fuzzCoordinate).toHaveBeenCalledWith({
			latitude: -23.55,
			longitude: -46.63,
			minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
			maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
		});
	});

	it("should fuzz public coordinates when location changes", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		const dto = Object.assign(
			{},
			{
				location: Object.assign(
					{},
					{
						latitude: -23.55,
						longitude: -46.63,
					},
				),
			},
		);

		await service.updateDraft({ jobId: completeJob.id, posterUserId: posterUserId, updatedDto: dto });

		expect(locationService.fuzzCoordinate).toHaveBeenCalledWith({
			latitude: -23.55,
			longitude: -46.63,
			minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
			maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
		});
	});

	it("should persist a changed description without waiting for AI derivation", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		const dto = Object.assign(
			{},
			{
				description: "Preciso de ajuda para carregar móveis na mudança sábado.",
			},
		);

		await service.updateDraft({ jobId: completeJob.id, posterUserId: posterUserId, updatedDto: dto });

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					description: "Preciso de ajuda para carregar móveis na mudança sábado.",
				}),
			}),
		);
	});

	it("should clear stale derived metadata when a draft description changes", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);

		await service.updateDraft({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign({}, { description: "Preciso de ajuda para carregar móveis na mudança sábado." }),
		});

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ title: null, descriptionSummary: null }),
			}),
		);
	});

	it("should derive current metadata before changing an active description", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });
		jobRepository.update.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });
		aiService.generateObject.mockResolvedValue({
			title: "Ajudante de mudança",
			description_summary: "Carregar móveis durante uma mudança no sábado",
		});

		await service.updatePublicJob({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign({}, { description: "Preciso de ajuda para carregar móveis na mudança sábado." }),
		});

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					description: "Preciso de ajuda para carregar móveis na mudança sábado.",
					title: "Ajudante de mudança",
					descriptionSummary: "Carregar móveis durante uma mudança no sábado",
				}),
			}),
		);
	});

	it("should not enqueue another derivation after synchronously updating active metadata", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });
		jobRepository.update.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.updatePublicJob({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign({}, { description: "Preciso de ajuda para carregar móveis na mudança sábado." }),
		});

		expect(outboundCallMock).not.toHaveBeenCalled();
	});

	it("should keep an active description unchanged when its metadata cannot be derived", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });
		jobRepository.update.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });
		aiService.generateObject.mockRejectedValue(new Error("Provider unavailable"));

		await service
			.updatePublicJob({
				jobId: completeJob.id,
				posterUserId: posterUserId,
				updatedDto: Object.assign({}, { description: "Preciso de ajuda para carregar móveis na mudança sábado." }),
			})
			.catch(() => undefined);

		expect(jobRepository.update).not.toHaveBeenCalled();
	});

	it("should not save a replacement contact when public description derivation fails", async () => {
		jobRepository.findPublicByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });
		aiService.generateObject.mockRejectedValue(new Error("Provider unavailable"));

		await service
			.updatePublicJob({
				jobId: completeJob.id,
				posterUserId: posterUserId,
				updatedDto: {
					description: "Preciso de ajuda para carregar móveis na mudança sábado.",
					contact: { contactMethod: JobContactMethod.WHATSAPP, identifier: "@novo.contato" },
				},
			})
			.catch(() => undefined);

		expect(userService.getOrAddContact).not.toHaveBeenCalled();
	});

	it("should not request AI while updating a job description", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		const dto = Object.assign(
			{},
			{
				description: "Preciso de ajuda para carregar móveis na mudança sábado.",
			},
		);

		await service.updateDraft({ jobId: completeJob.id, posterUserId: posterUserId, updatedDto: dto });

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should queue job data derivation after updating a job description", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		const dto = Object.assign(
			{},
			{
				description: "Preciso de ajuda para carregar móveis na mudança sábado.",
			},
		);

		await service.updateDraft({ jobId: completeJob.id, posterUserId: posterUserId, updatedDto: dto });

		expect(outboundCallMock.mock.calls).toEqual([
			[
				{
					host: "derive-job-data.queue",
					body: { jobId: completeJob.id },
				},
			],
		]);
	});

	it("should persist a changed draft description before publishing its derivation message", async () => {
		const completedOperations: string[] = [];
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		jobRepository.update.mockImplementationOnce(async () => {
			completedOperations.push("draft persisted");
			return completeJob;
		});
		outboundCallMock.mockImplementationOnce(async () => {
			completedOperations.push("derivation message published");
			return new Response(null, { status: 204 });
		});

		await service.updateDraft({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign({}, { description: "Preciso de ajuda para carregar móveis na mudança sábado." }),
		});

		expect(completedOperations).toEqual(["draft persisted", "derivation message published"]);
	});

	it("should not queue job data derivation when the description was not updated", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		const dto = Object.assign({}, { type: JobType.CONTRACTOR });

		await service.updateDraft({ jobId: completeJob.id, posterUserId: posterUserId, updatedDto: dto });

		expect(outboundCallMock).not.toHaveBeenCalled();
	});

	it("should not queue job data derivation when the submitted draft description is unchanged", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);

		await service.updateDraft({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign({}, { description: completeJob.description }),
		});

		expect(outboundCallMock).not.toHaveBeenCalled();
	});

	it("should not request AI when the submitted active description is unchanged", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });
		jobRepository.update.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.updatePublicJob({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign({}, { description: completeJob.description }),
		});

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should persist a flexible payment when amount fields are omitted", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, type: JobType.CONTRACTOR });

		await service.updateDraft({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign(
				{},
				{
					payment: {
						type: JobPaymentType.FLEXIBLE,
						amountPeriod: JobPaymentAmountPeriod.MONTHLY,
						currency: "BRL",
					},
				},
			),
		});

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ paymentType: JobPaymentType.FLEXIBLE }) }),
		);
	});

	it.each([JobStatus.DRAFT, JobStatus.ACTIVE, JobStatus.CLOSED])(
		"should reject a single-payment period when editing a %s employment job",
		async (status) => {
			jobRepository.findByIdFromPoster.mockResolvedValue({
				...completeJob,
				status: status,
				type: JobType.EMPLOYMENT,
				paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
			});

			const update = {
				jobId: completeJob.id,
				posterUserId: posterUserId,
				updatedDto: Object.assign(
					{},
					{
						payment: Object.assign(
							{},
							{
								type: JobPaymentType.FIXED,
								minAmount: 200,
								amountPeriod: JobPaymentAmountPeriod.SINGLE,
								currency: "BRL",
							},
						),
					},
				),
			};

			await expect(
				status === JobStatus.DRAFT ? service.updateDraft(update) : service.updatePublicJob(update),
			).rejects.toBeInstanceOf(InvalidEmploymentPaymentError);
		},
	);

	it("should allow a single-payment period when editing an active contractor job", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			status: JobStatus.ACTIVE,
			type: JobType.CONTRACTOR,
			paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
		});
		jobRepository.update.mockResolvedValue({
			...completeJob,
			status: JobStatus.ACTIVE,
			type: JobType.CONTRACTOR,
		});

		await service.updatePublicJob({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			updatedDto: Object.assign(
				{},
				{
					payment: Object.assign(
						{},
						{
							type: JobPaymentType.FIXED,
							minAmount: 200,
							amountPeriod: JobPaymentAmountPeriod.SINGLE,
							currency: "BRL",
						},
					),
				},
			),
		});

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE }),
			}),
		);
	});

	it("should report every missing publication field before changing status", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: null,
			contact: null,
			fuzzyLatitude: null,
			type: null,
			paymentType: null,
			paymentAmountPeriod: null,
			paymentCurrency: null,
		});

		await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toThrow(
			"contact, location, payment, type",
		);
	});

	it("should not derive feed metadata for a draft missing publication fields", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
			contact: null,
		});

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId }).catch(() => undefined);

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should return an owned active job when publication is retried", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		const result = await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(result.status).toBe(JobStatus.ACTIVE);
	});

	it("should not publish an owned active job again", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(jobRepository.publishDraft).not.toHaveBeenCalled();
	});

	it("should reject publication of a closed job", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({ ...completeJob, status: JobStatus.CLOSED });

		await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toBeInstanceOf(
			JobAlreadyPublishedError,
		);
	});

	it("should return job not found when the job being published does not exist", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(null);

		await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toBeInstanceOf(
			JobNotFoundError,
		);
	});

	it("should not publish a draft that the authenticated user does not own", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(null);

		await service
			.publishJob({
				jobId: completeJob.id,
				posterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			})
			.catch(() => undefined);

		expect(jobRepository.publishDraft).not.toHaveBeenCalled();
	});

	it("should require payment before publishing a draft", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			paymentType: null,
			paymentMinAmount: null,
			paymentMaxAmount: null,
			paymentNote: null,
			paymentAmountPeriod: null,
			paymentCurrency: null,
		});

		await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toThrow("payment");
	});

	it("should require a contact reference before publishing a draft", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			contact: null,
		});

		await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toBeInstanceOf(
			JobDraftIncompleteError,
		);
	});

	it.each(["fuzzyLatitude", "fuzzyLongitude"] as const)(
		"should require a complete location before publishing when %s is missing",
		async (field) => {
			jobRepository.findByIdFromPoster.mockResolvedValue({
				...completeJob,
				[field]: null,
			});

			await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toThrow(
				"location",
			);
		},
	);

	it.each(["paymentType", "paymentAmountPeriod", "paymentCurrency"] as const)(
		"should require complete payment details before publishing when %s is missing",
		async (field) => {
			jobRepository.findByIdFromPoster.mockResolvedValue({
				...completeJob,
				[field]: null,
			});

			await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toThrow(
				"payment",
			);
		},
	);

	it("should require a job type before publishing a draft", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			type: null,
		});

		await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toThrow("type");
	});

	it("should regenerate missing feed metadata before publication", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(aiService.generateObject).toHaveBeenCalledOnce();
	});

	it("should persist regenerated feed metadata before publication", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(jobRepository.update).toHaveBeenCalledWith({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			data: {
				title: completeJob.title,
				descriptionSummary: completeJob.descriptionSummary,
			},
		});
	});

	it("should refresh the derived title when the summary is missing before publication", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: "Título derivado anteriormente",
			descriptionSummary: null,
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(jobRepository.update).toHaveBeenCalledWith({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			data: {
				title: completeJob.title,
				descriptionSummary: completeJob.descriptionSummary,
			},
		});
	});

	it("should refresh the derived summary when the title is missing before publication", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: "Resumo existente",
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(jobRepository.update).toHaveBeenCalledWith({
			jobId: completeJob.id,
			posterUserId: posterUserId,
			data: {
				title: completeJob.title,
				descriptionSummary: completeJob.descriptionSummary,
			},
		});
	});

	it("should return AI unavailable when publication metadata retry fails", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		aiService.generateObject.mockRejectedValue(new JobDataDerivationUnavailableError());

		await expect(service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId })).rejects.toBeInstanceOf(
			JobDataDerivationUnavailableError,
		);
	});

	it("should not activate a draft when publication metadata retry fails", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		aiService.generateObject.mockRejectedValue(new JobDataDerivationUnavailableError());

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId }).catch(() => undefined);

		expect(jobRepository.publishDraft).not.toHaveBeenCalled();
	});

	it("should not call AI when both feed metadata fields already exist", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should publish a contractor job with a single-payment period", async () => {
		const contractorDraft = {
			...completeJob,
			type: JobType.CONTRACTOR,
			paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
		};
		jobRepository.findByIdFromPoster.mockResolvedValue(contractorDraft);
		jobRepository.publishDraft.mockResolvedValue({ ...contractorDraft, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(jobRepository.publishDraft).toHaveBeenCalledWith({
			jobId: completeJob.id,
			posterUserId: posterUserId,
		});
	});

	it("should atomically activate a complete draft with its generated summary", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(jobRepository.publishDraft).toHaveBeenCalledWith({
			jobId: completeJob.id,
			posterUserId: posterUserId,
		});
	});

	it("should return the active job response after publication", async () => {
		jobRepository.findByIdFromPoster.mockResolvedValue(completeJob);
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		const result = await service.publishJob({ jobId: completeJob.id, posterUserId: posterUserId });

		expect(PublicJobOutputSchema.safeParse(result).success).toBe(true);
	});
});
