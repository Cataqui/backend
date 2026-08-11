import { Test } from "@nestjs/testing";
import fc, { type Arbitrary } from "fast-check";
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
import { UpdateJobInputSchema } from "./schemas/update-job-input.schema";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

const outboundCallMock = vi.hoisted(() => vi.fn());

vi.mock("../../platform/cloudflare/containers/api/outbound/api-container-outbound", () => ({
	outboundCall: outboundCallMock,
}));

const createdAt = new Date("2026-07-30T12:00:00.000Z");
const posterUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const existingJob = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	posterUserId: posterUserId,
	contactId: null,
	title: "Auxiliar de cozinha",
	description: "Descrição completa da oportunidade.",
	descriptionSummary: "Descrição completa da oportunidade.",
	contact: null,
	street: null,
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	locationPoint: null,
	fuzzyLatitude: { toNumber: (): number => -23.55 },
	fuzzyLongitude: { toNumber: (): number => -46.63 },
	status: JobStatus.DRAFT,
	type: JobType.INDIVIDUAL,
	paymentType: null,
	paymentMinAmount: null,
	paymentMaxAmount: null,
	paymentNote: null,
	paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
	paymentCurrency: null,
	createdAt: createdAt,
	updatedAt: createdAt,
};

type RepositoryUpdate = {
	data?: Record<string, unknown>;
	locationPoint?: Record<string, unknown>;
};

type UpdateFieldCase = {
	name: string;
	arbitrary: Arbitrary<z.infer<typeof UpdateJobInputSchema>>;
	isPersisted: (params: {
		dto: z.infer<typeof UpdateJobInputSchema>;
		repositoryUpdate: RepositoryUpdate;
		contactCreation?: Record<string, unknown>;
	}) => boolean;
};

const validContact = { contactMethod: JobContactMethod.WHATSAPP, identifier: "+5511999999999" };
const validLocation = {
	street: "Rua das Flores, 10",
	neighborhood: "Centro",
	city: "São Paulo",
	state: "SP",
	country: "BR",
	latitude: -23.55,
	longitude: -46.63,
};
const validPayment = {
	type: JobPaymentType.FIXED,
	minAmount: 150,
	amountPeriod: JobPaymentAmountPeriod.SINGLE,
	currency: "BRL",
};

function _parsedUpdateArbitrary(
	payloadArbitrary: Arbitrary<Record<string, unknown>>,
): Arbitrary<z.infer<typeof UpdateJobInputSchema>> {
	return payloadArbitrary.map((payload) => UpdateJobInputSchema.parse(payload));
}

const updateFieldCases: UpdateFieldCase[] = [
	{
		name: "description",
		arbitrary: _parsedUpdateArbitrary(
			fc.record({ description: fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{8,198}[A-Za-z0-9]$/u) }),
		),
		isPersisted: ({ dto, repositoryUpdate }) => repositoryUpdate.data?.["description"] === dto.description,
	},
	{
		name: "type",
		arbitrary: _parsedUpdateArbitrary(fc.record({ type: fc.constantFrom(...Object.values(JobType)) })),
		isPersisted: ({ dto, repositoryUpdate }) => repositoryUpdate.data?.["type"] === dto.type,
	},
	{
		name: "contact.contactMethod",
		arbitrary: _parsedUpdateArbitrary(
			fc.record({
				contact: fc.record({
					contactMethod: fc.constantFrom(...Object.values(JobContactMethod)),
					identifier: fc.constant(validContact.identifier),
				}),
			}),
		),
		isPersisted: ({ dto, contactCreation }) => contactCreation?.["contactMethod"] === dto.contact?.contactMethod,
	},
	{
		name: "contact.identifier",
		arbitrary: _parsedUpdateArbitrary(
			fc.record({
				contact: fc.record({
					contactMethod: fc.constant(validContact.contactMethod),
					identifier: fc.constantFrom("+5511999999999", "+14155552671", "+442071838750"),
				}),
			}),
		),
		isPersisted: ({ dto, contactCreation }) => contactCreation?.["identifier"] === dto.contact?.identifier,
	},
	...(
		[
			["street", fc.stringMatching(/^[A-Za-z0-9](?:[A-Za-z0-9 ]{0,98}[A-Za-z0-9])?$/u), "data", "street"],
			["neighborhood", fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,98}[A-Za-z0-9]$/u), "data", "neighborhood"],
			["city", fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,98}[A-Za-z0-9]$/u), "data", "city"],
			["state", fc.constantFrom("SP", "RJ", "MG"), "data", "state"],
			["country", fc.constantFrom("BR", "US", "PT"), "data", "country"],
			["latitude", fc.double({ min: -90, max: 90, noNaN: true }), "locationPoint", "latitude"],
			["longitude", fc.double({ min: -180, max: 180, noNaN: true }), "locationPoint", "longitude"],
		] as const
	).map(
		([fieldName, valueArbitrary, repositorySection, repositoryField]): UpdateFieldCase => ({
			name: `location.${fieldName}`,
			arbitrary: _parsedUpdateArbitrary(
				valueArbitrary.map((value) => ({ location: { ...validLocation, [fieldName]: value } })),
			),
			isPersisted: ({ dto, repositoryUpdate }) =>
				repositoryUpdate[repositorySection]?.[repositoryField] === dto.location?.[fieldName],
		}),
	),
	{
		name: "payment.type",
		arbitrary: _parsedUpdateArbitrary(fc.constant({ payment: validPayment })),
		isPersisted: ({ dto, repositoryUpdate }) => repositoryUpdate.data?.["paymentType"] === dto.payment?.type,
	},
	{
		name: "payment.minAmount",
		arbitrary: _parsedUpdateArbitrary(
			fc.integer({ min: 1, max: 9_999_999_999 }).map((amountCents) => ({
				payment: { ...validPayment, minAmount: amountCents / 100 },
			})),
		),
		isPersisted: ({ dto, repositoryUpdate }) => repositoryUpdate.data?.["paymentMinAmount"] === dto.payment?.minAmount,
	},
	{
		name: "payment.maxAmount",
		arbitrary: _parsedUpdateArbitrary(
			fc.integer({ min: 101, max: 9_999_999_999 }).map((amountCents) => ({
				payment: { ...validPayment, type: JobPaymentType.RANGE, minAmount: 1, maxAmount: amountCents / 100 },
			})),
		),
		isPersisted: ({ dto, repositoryUpdate }) => repositoryUpdate.data?.["paymentMaxAmount"] === dto.payment?.maxAmount,
	},
	{
		name: "payment.note",
		arbitrary: _parsedUpdateArbitrary(
			fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,199}$/u).map((note) => ({
				payment: {
					type: JobPaymentType.OTHER,
					note: note,
					amountPeriod: JobPaymentAmountPeriod.SINGLE,
					currency: "BRL",
				},
			})),
		),
		isPersisted: ({ dto, repositoryUpdate }) => repositoryUpdate.data?.["paymentNote"] === dto.payment?.note,
	},
	{
		name: "payment.amountPeriod",
		arbitrary: _parsedUpdateArbitrary(
			fc.constantFrom(...Object.values(JobPaymentAmountPeriod)).map((amountPeriod) => ({
				payment: { ...validPayment, amountPeriod: amountPeriod },
			})),
		),
		isPersisted: ({ dto, repositoryUpdate }) =>
			repositoryUpdate.data?.["paymentAmountPeriod"] === dto.payment?.amountPeriod,
	},
	{
		name: "payment.currency",
		arbitrary: _parsedUpdateArbitrary(
			fc.constantFrom("BRL", "USD", "EUR").map((currency) => ({
				payment: { ...validPayment, currency: currency },
			})),
		),
		isPersisted: ({ dto, repositoryUpdate }) => repositoryUpdate.data?.["paymentCurrency"] === dto.payment?.currency,
	},
];

describe("Updating every field in UpdateJobInputSchema", () => {
	let service: JobService;
	let jobRepository: {
		findDraftByIdFromPoster: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
	};
	let userService: { getOrAddContact: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		outboundCallMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
		jobRepository = {
			findDraftByIdFromPoster: vi.fn().mockResolvedValue(existingJob),
			update: vi.fn().mockResolvedValue(existingJob),
		};
		userService = {
			getOrAddContact: vi.fn().mockResolvedValue({ contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
		};

		const module = await Test.createTestingModule({
			providers: [
				JobService,
				{ provide: JobRepository, useValue: jobRepository },
				{ provide: UserService, useValue: userService },
				{ provide: AiService, useValue: { generateObject: vi.fn() } },
				{
					provide: LocationService,
					useValue: {
						fuzzCoordinate: vi.fn((params: { latitude: number; longitude: number }) => ({
							latitude: params.latitude,
							longitude: params.longitude,
						})),
					},
				},
			],
		}).compile();

		service = module.get(JobService);
	});

	it.each(updateFieldCases)("should persist every valid $name update", async ({ arbitrary, isPersisted }) => {
		await expect(
			fc.assert(
				fc.asyncProperty(arbitrary, async (updatedDto) => {
					jobRepository.update.mockClear();
					userService.getOrAddContact.mockClear();

					await service.updateDraft({
						jobId: existingJob.id,
						posterUserId: posterUserId,
						updatedDto: updatedDto,
					});

					const repositoryUpdate = jobRepository.update.mock.lastCall?.[0] as RepositoryUpdate | undefined;
					const savedContactInput = userService.getOrAddContact.mock.lastCall?.[0] as
						| { contact?: Record<string, unknown> }
						| undefined;
					const contactCreation = savedContactInput?.contact;
					return (
						repositoryUpdate !== undefined &&
						isPersisted({
							dto: updatedDto,
							repositoryUpdate: repositoryUpdate,
							...(contactCreation === undefined ? {} : { contactCreation: contactCreation }),
						})
					);
				}),
				{ numRuns: 25 },
			),
		).resolves.toBeUndefined();
	});
});
