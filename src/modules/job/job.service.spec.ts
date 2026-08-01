import { Test } from "@nestjs/testing";
import {
	JobContactMethod,
	JobPaymentAmountPeriod,
	JobPaymentType,
	JobStatus,
	JobType,
} from "../../../generated/prisma/client.js";
import { AiService } from "../ai/ai.service";
import { MapService } from "../map/map.service";
import { JobLocationConstants } from "./constants/job-location.constants";
import { RequiredToPublishMetadata } from "./decorators/required-to-publish.decorator";
import { DeriveJobDataPublisher } from "./derive-job-data.publisher";
import { JobContactInputDto } from "./dto/job-contact-input.dto";
import { JobLocationInputDto } from "./dto/job-location-input.dto";
import { JobOutputDto } from "./dto/job-output.dto";
import { JobPaymentInputDto } from "./dto/job-payment-input.dto";
import { UpdateJobRequestDto } from "./dto/update-job-request.dto";
import { InvalidEmploymentPaymentError } from "./errors/invalid-job-type-period.error";
import { JobAlreadyPublishedError } from "./errors/job-already-published.error";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobDraftIncompleteError } from "./errors/job-draft-incomplete.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

/* eslint-disable @typescript-eslint/unbound-method */

const createdAt = new Date("2026-07-30T12:00:00.000Z");
const contact = {
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	contactMethod: JobContactMethod.WHATSAPP,
	identifier: "+5511999999999",
	createdAt: createdAt,
	updatedAt: createdAt,
};
const completeJob = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: "Auxiliar de cozinha",
	description: "Descrição completa da oportunidade.",
	descriptionSummary: "Descrição completa da oportunidade.",
	contact: contact,
	street: "Rua das Flores, 123",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
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
function createCompleteUpdateDto(): UpdateJobRequestDto {
	return Object.assign(new UpdateJobRequestDto(), {
		description: completeJob.description,
		contact: Object.assign(new JobContactInputDto(), {
			contactMethod: JobContactMethod.WHATSAPP,
			identifier: "+5511999999999",
		}),
		location: Object.assign(new JobLocationInputDto(), {
			street: completeJob.street,
			neighborhood: completeJob.neighborhood,
			city: completeJob.city,
			state: completeJob.state,
			country: completeJob.country,
			latitude: -23.55,
			longitude: -46.63,
		}),
		type: JobType.EMPLOYMENT,
		payment: Object.assign(new JobPaymentInputDto(), {
			type: JobPaymentType.FIXED,
			minAmount: 2100,
			amountPeriod: JobPaymentAmountPeriod.MONTHLY,
			currency: "BRL",
		}),
	});
}

describe("JobService", () => {
	let service: JobService;
	let jobRepository: {
		createDraft: ReturnType<typeof vi.fn>;
		findById: ReturnType<typeof vi.fn>;
		findContactByIdAndJobId: ReturnType<typeof vi.fn>;
		updateDerivedJobDataIfDescriptionUnchanged: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		publishDraft: ReturnType<typeof vi.fn>;
	};
	let aiService: { generateObject: ReturnType<typeof vi.fn> };
	let deriveJobDataPublisher: { publish: ReturnType<typeof vi.fn> };
	let mapService: { fuzzLocationCoordinate: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		jobRepository = {
			createDraft: vi.fn(),
			findById: vi.fn().mockResolvedValue(null),
			findContactByIdAndJobId: vi.fn().mockResolvedValue(null),
			updateDerivedJobDataIfDescriptionUnchanged: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
			publishDraft: vi.fn(),
		};
		aiService = {
			generateObject: vi.fn().mockResolvedValue({
				title: completeJob.title,
				description_summary: completeJob.descriptionSummary,
			}),
		};
		deriveJobDataPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
		mapService = {
			fuzzLocationCoordinate: vi.fn().mockReturnValue({ latitude: -23.551, longitude: -46.631 }),
		};

		const module = await Test.createTestingModule({
			providers: [
				JobService,
				{ provide: JobRepository, useValue: jobRepository },
				{ provide: AiService, useValue: aiService },
				{ provide: DeriveJobDataPublisher, useValue: deriveJobDataPublisher },
				{ provide: MapService, useValue: mapService },
			],
		}).compile();

		service = module.get(JobService);
	});

	it("should return a published job before checking for a draft", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			status: JobStatus.ACTIVE,
		});

		const result = await service.getJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(result).toBeInstanceOf(JobOutputDto);
	});

	it("should return a draft when no published job has the ID", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);

		const result = await service.getJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(result).toBeInstanceOf(JobOutputDto);
	});

	it("should return not found when neither a published job nor draft exists", async () => {
		await expect(service.getJob({ jobId: completeJob.id, locale: "pt-BR" })).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("should return a published job contact", async () => {
		jobRepository.findContactByIdAndJobId.mockResolvedValue(contact);

		const result = await service.getJobContact({ contactId: contact.id, jobId: completeJob.id });

		expect(result.identifier).toBe("+5511999999999");
	});

	it("should reject an unavailable job contact", async () => {
		await expect(service.getJobContact({ contactId: contact.id, jobId: completeJob.id })).rejects.toThrow("contact");
	});

	it("should reject updates for an unknown job", async () => {
		await expect(
			service.updateJob({
				jobId: completeJob.id,
				updatedDto: Object.assign(new UpdateJobRequestDto(), { description: "Nova descrição da oportunidade." }),
				locale: "pt-BR",
			}),
		).rejects.toBeInstanceOf(JobNotFoundError);
	});

	it("should persist supplied draft fields, contact, and real location together", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);

		await service.updateJob({ jobId: completeJob.id, updatedDto: createCompleteUpdateDto(), locale: "pt-BR" });

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				jobId: completeJob.id,
				contact: {
					contactMethod: JobContactMethod.WHATSAPP,
					identifier: "+5511999999999",
				},
				locationPoint: {
					latitude: -23.55,
					longitude: -46.63,
				},
			}),
		);
	});

	it("should ask the map service to fuzz an edited street location", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);

		await service.updateJob({
			jobId: completeJob.id,
			updatedDto: createCompleteUpdateDto(),
			locale: "pt-BR",
		});

		expect(mapService.fuzzLocationCoordinate).toHaveBeenCalledWith({
			latitude: -23.55,
			longitude: -46.63,
			minDistanceMeters: JobLocationConstants.FUZZ_MIN_DISTANCE_METERS,
			maxDistanceMeters: JobLocationConstants.FUZZ_MAX_DISTANCE_METERS,
		});
	});

	it("should keep exact coordinates when an edited location has no street", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		const dto = Object.assign(new UpdateJobRequestDto(), {
			location: Object.assign(new JobLocationInputDto(), {
				neighborhood: "Centro",
				city: "São Paulo",
				state: "SP",
				country: "BR",
				latitude: -23.55,
				longitude: -46.63,
			}),
		});

		await service.updateJob({ jobId: completeJob.id, updatedDto: dto, locale: "pt-BR" });

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					fuzzyLatitude: -23.55,
					fuzzyLongitude: -46.63,
				}),
			}),
		);
	});

	it("should persist a changed description without waiting for AI derivation", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		const dto = Object.assign(new UpdateJobRequestDto(), {
			description: "Preciso de ajuda para carregar móveis na mudança sábado.",
		});

		await service.updateJob({ jobId: completeJob.id, updatedDto: dto, locale: "pt-BR" });

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					description: "Preciso de ajuda para carregar móveis na mudança sábado.",
				}),
			}),
		);
	});

	it("should not request AI while updating a job description", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		const dto = Object.assign(new UpdateJobRequestDto(), {
			description: "Preciso de ajuda para carregar móveis na mudança sábado.",
		});

		await service.updateJob({ jobId: completeJob.id, updatedDto: dto, locale: "pt-BR" });

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should queue job data derivation after updating a job description", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		const dto = Object.assign(new UpdateJobRequestDto(), {
			description: "Preciso de ajuda para carregar móveis na mudança sábado.",
		});

		await service.updateJob({ jobId: completeJob.id, updatedDto: dto, locale: "pt-BR" });

		expect(deriveJobDataPublisher.publish.mock.calls).toEqual([[{ jobId: completeJob.id }]]);
	});

	it("should not queue job data derivation when the description was not updated", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		const dto = Object.assign(new UpdateJobRequestDto(), { type: JobType.CONTRACTOR });

		await service.updateJob({ jobId: completeJob.id, updatedDto: dto, locale: "pt-BR" });

		expect(deriveJobDataPublisher.publish).not.toHaveBeenCalled();
	});

	it.each([
		JobStatus.DRAFT,
		JobStatus.ACTIVE,
		JobStatus.CLOSED,
	])("should reject a single-payment period when editing a %s employment job", async (status) => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			status: status,
			type: JobType.EMPLOYMENT,
			paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
		});

		await expect(
			service.updateJob({
				jobId: completeJob.id,
				updatedDto: Object.assign(new UpdateJobRequestDto(), {
					payment: Object.assign(new JobPaymentInputDto(), {
						type: JobPaymentType.FIXED,
						minAmount: 200,
						amountPeriod: JobPaymentAmountPeriod.SINGLE,
						currency: "BRL",
					}),
				}),
				locale: "pt-BR",
			}),
		).rejects.toBeInstanceOf(InvalidEmploymentPaymentError);
	});

	it("should allow a single-payment period when editing an active contractor job", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			status: JobStatus.ACTIVE,
			type: JobType.CONTRACTOR,
			paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
		});

		await service.updateJob({
			jobId: completeJob.id,
			updatedDto: Object.assign(new UpdateJobRequestDto(), {
				payment: Object.assign(new JobPaymentInputDto(), {
					type: JobPaymentType.FIXED,
					minAmount: 200,
					amountPeriod: JobPaymentAmountPeriod.SINGLE,
					currency: "BRL",
				}),
			}),
			locale: "pt-BR",
		});

		expect(jobRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE }),
			}),
		);
	});

	it("should report every missing publication field before changing status", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			title: null,
			contact: null,
			neighborhood: null,
			type: null,
			paymentType: null,
			paymentAmountPeriod: null,
			paymentCurrency: null,
		});

		await expect(service.publishJob({ jobId: completeJob.id, locale: "pt-BR" })).rejects.toThrow(
			"contact, location, payment, type",
		);
	});

	it("should tell the consumer when a job has already been published", async () => {
		jobRepository.findById.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await expect(service.publishJob({ jobId: completeJob.id, locale: "pt-BR" })).rejects.toBeInstanceOf(
			JobAlreadyPublishedError,
		);
	});

	it("should return job not found when the job being published does not exist", async () => {
		jobRepository.findById.mockResolvedValue(null);

		await expect(service.publishJob({ jobId: completeJob.id, locale: "pt-BR" })).rejects.toBeInstanceOf(
			JobNotFoundError,
		);
	});

	it("should require payment before publishing a draft", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			paymentType: null,
			paymentMinAmount: null,
			paymentMaxAmount: null,
			paymentNote: null,
			paymentAmountPeriod: null,
			paymentCurrency: null,
		});

		await expect(service.publishJob({ jobId: completeJob.id, locale: "pt-BR" })).rejects.toThrow("payment");
	});

	it("should require a contact reference before publishing a draft", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			contact: null,
		});

		await expect(service.publishJob({ jobId: completeJob.id, locale: "pt-BR" })).rejects.toBeInstanceOf(
			JobDraftIncompleteError,
		);
	});

	it("should regenerate missing feed metadata before publication", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(aiService.generateObject).toHaveBeenCalledOnce();
	});

	it("should persist regenerated feed metadata before publication", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(jobRepository.update).toHaveBeenCalledWith({
			jobId: completeJob.id,
			data: {
				title: completeJob.title,
				descriptionSummary: completeJob.descriptionSummary,
			},
		});
	});

	it("should refresh the derived title when the summary is missing before publication", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			title: "Título derivado anteriormente",
			descriptionSummary: null,
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(jobRepository.update).toHaveBeenCalledWith({
			jobId: completeJob.id,
			data: {
				title: completeJob.title,
				descriptionSummary: completeJob.descriptionSummary,
			},
		});
	});

	it("should refresh the derived summary when the title is missing before publication", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: "Resumo existente",
		});
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(jobRepository.update).toHaveBeenCalledWith({
			jobId: completeJob.id,
			data: {
				title: completeJob.title,
				descriptionSummary: completeJob.descriptionSummary,
			},
		});
	});

	it("should return AI unavailable when publication metadata retry fails", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		aiService.generateObject.mockRejectedValue(new JobDataDerivationUnavailableError());

		await expect(service.publishJob({ jobId: completeJob.id, locale: "pt-BR" })).rejects.toBeInstanceOf(
			JobDataDerivationUnavailableError,
		);
	});

	it("should not activate a draft when publication metadata retry fails", async () => {
		jobRepository.findById.mockResolvedValue({
			...completeJob,
			title: null,
			descriptionSummary: null,
		});
		aiService.generateObject.mockRejectedValue(new JobDataDerivationUnavailableError());

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" }).catch(() => undefined);

		expect(jobRepository.publishDraft).not.toHaveBeenCalled();
	});

	it("should not call AI when both feed metadata fields already exist", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(aiService.generateObject).not.toHaveBeenCalled();
	});

	it("should publish a contractor job with a single-payment period", async () => {
		const contractorDraft = {
			...completeJob,
			type: JobType.CONTRACTOR,
			paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
		};
		jobRepository.findById.mockResolvedValue(contractorDraft);
		jobRepository.publishDraft.mockResolvedValue({ ...contractorDraft, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(jobRepository.publishDraft).toHaveBeenCalledWith({ jobId: completeJob.id });
	});

	it("should atomically activate a complete draft with its generated summary", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(jobRepository.publishDraft).toHaveBeenCalledWith({
			jobId: completeJob.id,
		});
	});

	it("should return the active job response after publication", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		const result = await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });

		expect(result).toBeInstanceOf(JobOutputDto);
	});

	it("should return a published job with every publication requirement present", async () => {
		jobRepository.findById.mockResolvedValue(completeJob);
		jobRepository.publishDraft.mockResolvedValue({ ...completeJob, status: JobStatus.ACTIVE });

		const result = await service.publishJob({ jobId: completeJob.id, locale: "pt-BR" });
		const missingFields = RequiredToPublishMetadata.getFields({ dtoClass: JobOutputDto })
			.filter(({ propertyName }) => result[propertyName] === null)
			.map(({ publicFieldName }) => publicFieldName);

		expect(missingFields).toEqual([]);
	});
});
