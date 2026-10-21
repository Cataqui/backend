import { RemoteError } from "@cataqui/workerhole";
import { createHash } from "node:crypto";
import { JobImagesUnavailableError } from "./errors/job-images-unavailable.error";
import * as td from "testdouble";
import type { z } from "zod";

import { Test } from "@nestjs/testing";

import { JobStatus, Prisma } from "../../../generated/prisma/client";
import { AiService } from "../ai/ai.service";
import { ContactService } from "../contact/contact.service";
import { LocationService } from "../location/location.service";
import { JobDataDerivationUnavailableError } from "./errors/job-data-derivation-unavailable.error";
import { JobIdempotencyConflictError } from "./errors/job-idempotency-conflict.error";
import { JobNotFoundError } from "./errors/job-not-found.error";
import { JobService } from "./job.service";
import { ApiWorkerPortal } from "@cataqui/api-workerhole";
import { JobRepository } from "./repositories/job.repository";
import type { CreateJobInputSchema } from "./schemas/create-job-input.schema";
import type { JobDerivedDataSchema } from "./schemas/job-derived-data.schema";
import { decodeProfileJobsCursor, encodeProfileJobsCursor } from "./utils/profile-jobs-cursor.utils";

const dto = {
	description: "Preciso de ajuda para descarregar caixas amanhã. Pago R$ 150 por dia.",
	location: { title: "Rua Pardal Branco, 32", latitude: -23.55, longitude: -46.63 },
	contact: { method: "WHATSAPP" as const, identifier: "+5511999999999" },
} satisfies z.infer<typeof CreateJobInputSchema>;
const job = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
	title: "Descarregar caixas",
	description: dto.description,
	descriptionSummary: "Trabalho de um dia",
	payment: "R$ 150 por dia",
	contact: {
		id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		contactMethod: "WHATSAPP" as const,
		identifier: dto.contact.identifier,
		ownerProfileId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		createdAt: new Date("2026-09-22T12:00:00Z"),
	},
	fuzzyLatitude: new Prisma.Decimal(-23.55),
	fuzzyLongitude: new Prisma.Decimal(-46.63),
	locationImageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
	status: JobStatus.ACTIVE,
	posterProfileId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	locationTitle: dto.location.title,
	createdAt: new Date("2026-09-22T12:00:00Z"),
	updatedAt: new Date("2026-09-22T12:00:00Z"),
} satisfies Awaited<ReturnType<JobRepository["createJob"]>>;
const params = {
	dto: dto,
	posterProfileId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} satisfies Parameters<JobService["createJob"]>[0];

const derivedJobData = {
	title: job.title,
	description_summary: job.descriptionSummary,
	payment: job.payment,
} satisfies z.infer<typeof JobDerivedDataSchema>;

const savedContact = {
	contactId: job.contact.id,
	method: dto.contact.method,
	identifier: dto.contact.identifier,
} satisfies Awaited<ReturnType<ContactService["getOrAddContact"]>>;

const reservation = {
	id: "request",
	posterProfileId: params.posterProfileId,
	idempotencyKey: params.idempotencyKey,
	requestHash: createHash("sha256").update(JSON.stringify(dto)).digest("hex"),
	fuzzyLatitude: new Prisma.Decimal(-23.55),
	fuzzyLongitude: new Prisma.Decimal(-46.63),
	jobId: null,
	job: null,
	createdAt: new Date("2026-09-22T12:00:00Z"),
} satisfies NonNullable<Awaited<ReturnType<JobRepository["findByIdempotencyKey"]>>>;

afterEach(() => {
	td.reset();
});

describe("JobService direct posting", () => {
	let service: JobService;
	let repository: JobRepository;
	let ai: AiService;
	let contacts: ContactService;
	let location: LocationService;
	let apiWorkerRpc: ApiWorkerPortal;
	let getStaticMapLocationUrl: ApiWorkerPortal["getStaticMapLocationUrl"];

	beforeEach(async () => {
		repository = td.object<JobRepository>();
		ai = td.object<AiService>();
		contacts = td.object<ContactService>();
		location = td.object<LocationService>();
		apiWorkerRpc = td.object<ApiWorkerPortal>();
		td.when(apiWorkerRpc.withOptions(td.matchers.anything())).thenReturn(apiWorkerRpc);
		getStaticMapLocationUrl = apiWorkerRpc.getStaticMapLocationUrl;
		const module = await Test.createTestingModule({
			providers: [
				JobService,
				{ provide: JobRepository, useValue: repository },
				{ provide: AiService, useValue: ai },
				{ provide: ContactService, useValue: contacts },
				{ provide: LocationService, useValue: location },
				{
					provide: ApiWorkerPortal,
					useValue: apiWorkerRpc,
				},
			],
		}).compile();
		service = module.get(JobService);
	});

	it("passes only reserved fuzzy coordinates to Maps", async () => {
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			id: "request",
			job: null,
			requestHash: createHash("sha256").update(JSON.stringify(dto)).digest("hex"),
			fuzzyLatitude: new Prisma.Decimal(-23.6),
			fuzzyLongitude: new Prisma.Decimal(-46.7),
		});
		await service.createJob(params);
		expect(td.explain(getStaticMapLocationUrl).calls.map((call) => call.args)).toEqual([
			[{ latitude: -23.6, longitude: -46.7 }],
		]);
	});
	it("passes the 45-second Maps deadline to the Worker client", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		const originalTimeout = AbortSignal.timeout;
		const timeout = td.replace(AbortSignal, "timeout");
		td.when(timeout(td.matchers.anything())).thenDo((delay: number): AbortSignal => originalTimeout(delay));
		const signal = new AbortController().signal;
		td.when(timeout(45_000)).thenReturn(signal);
		await service.createJob(params);
		td.verify(apiWorkerRpc.withOptions({ signal: signal }));
	});

	it("requests location fuzzing between 300 and 500 meters when reserving a job", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenResolve(reservation);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);

		await service.createJob(params);

		expect(td.explain(location.fuzzCoordinate).calls.map((call) => call.args)).toEqual([
			[
				{
					latitude: dto.location.latitude,
					longitude: dto.location.longitude,
					minDistanceMeters: 300,
					maxDistanceMeters: 500,
				},
			],
		]);
	});

	it("requests the map reference once per posting attempt", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		await service.createJob(params);
		expect(td.explain(getStaticMapLocationUrl).callCount).toBe(1);
	});

	it("persists the returned map reference", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		const mapUrl = "https://maps.cataqui.com/static/v1/signed-posting-reference";
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: mapUrl });
		await service.createJob(params);
		expect(td.explain(repository.createJob).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ locationImageUrl: mapUrl }),
		]);
	});

	it.each([
		new RemoteError({
			name: "MapsError",
			message: "Static map URL generation failed.",
			errorCode: "INTERNAL_ERROR",
		}),
		new Error("transport"),
		new DOMException("deadline", "TimeoutError"),
	])("returns an unavailable outcome for an ambiguous or timed-out Maps call: %s", async (error) => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReject(error);
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobImagesUnavailableError);
	});

	it.each([
		new RemoteError({
			name: "MapsError",
			message: "Static map URL generation failed.",
			errorCode: "INTERNAL_ERROR",
		}),
		new Error("transport"),
		new DOMException("deadline", "TimeoutError"),
	])("does not repeat an ambiguous or timed-out Maps call: %s", async (error) => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReject(error);
		await service.createJob(params).catch(() => undefined);
		expect(td.explain(getStaticMapLocationUrl).callCount).toBe(1);
	});

	it.each([
		new RemoteError({
			name: "MapsError",
			message: "Static map URL generation failed.",
			errorCode: "INTERNAL_ERROR",
		}),
		new Error("transport"),
		new DOMException("deadline", "TimeoutError"),
	])("does not publish after an ambiguous or timed-out Maps call: %s", async (error) => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReject(error);
		await service.createJob(params).catch(() => undefined);

		expect(td.explain(repository.createJob).callCount).toBe(0);
	});

	it("returns an unavailable outcome after an unsuccessful posting attempt", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReject(new JobImagesUnavailableError());
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobImagesUnavailableError);
	});

	it("creates no public job after an unsuccessful posting attempt", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReject(new JobImagesUnavailableError());
		await service.createJob(params).catch(() => undefined);
		expect(td.explain(repository.createJob).callCount).toBe(0);
	});
	it("reuses reserved fuzzy coordinates after a failed posting attempt", async () => {
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			id: "request",
			job: null,
			requestHash: createHash("sha256").update(JSON.stringify(dto)).digest("hex"),
			fuzzyLatitude: new Prisma.Decimal(-23.6),
			fuzzyLongitude: new Prisma.Decimal(-46.7),
		});
		await service.createJob(params);
		expect(td.explain(getStaticMapLocationUrl).calls.map((call) => call.args)).toEqual([
			[{ latitude: -23.6, longitude: -46.7 }],
		]);
	});
	it("does not request a map URL again for an already completed posting key", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: job,
			requestHash: createHash("sha256").update(JSON.stringify(dto)).digest("hex"),
		});
		await service.createJob(params);
		expect(td.explain(getStaticMapLocationUrl).callCount).toBe(0);
	});
	it("derives job data while waiting for the map URL", async () => {
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		let resolveMaps!: (result: Awaited<ReturnType<ApiWorkerPortal["getStaticMapLocationUrl"]>>) => void;
		const maps = new Promise<Awaited<ReturnType<ApiWorkerPortal["getStaticMapLocationUrl"]>>>((resolve) => {
			resolveMaps = resolve;
		});
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReturn(maps);
		const pending = service.createJob(params);
		await vi.waitUntil(() => td.explain(getStaticMapLocationUrl).callCount === 1);
		const derivationsBeforeReady = td.explain(ai.generateObject).callCount;
		resolveMaps({ url: job.locationImageUrl });
		await pending;
		expect(derivationsBeforeReady).toBe(1);
	});

	it("prepares the contact while waiting for the map URL", async () => {
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		let resolveMaps!: (result: Awaited<ReturnType<ApiWorkerPortal["getStaticMapLocationUrl"]>>) => void;
		const maps = new Promise<Awaited<ReturnType<ApiWorkerPortal["getStaticMapLocationUrl"]>>>((resolve) => {
			resolveMaps = resolve;
		});
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReturn(maps);
		const pending = service.createJob(params);
		await vi.waitUntil(() => td.explain(getStaticMapLocationUrl).callCount === 1);
		const contactsBeforeReady = td.explain(contacts.getOrAddContact).callCount;
		resolveMaps({ url: job.locationImageUrl });
		await pending;
		expect(contactsBeforeReady).toBe(1);
	});

	it("waits for the map URL before creating the job", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		let resolveMaps!: (result: Awaited<ReturnType<ApiWorkerPortal["getStaticMapLocationUrl"]>>) => void;
		const maps = new Promise<Awaited<ReturnType<ApiWorkerPortal["getStaticMapLocationUrl"]>>>((resolve) => {
			resolveMaps = resolve;
		});
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenReturn(maps);
		const pending = service.createJob(params);
		await vi.waitUntil(() => td.explain(getStaticMapLocationUrl).callCount === 1);
		const createdBeforeReady = td.explain(repository.createJob).callCount;
		resolveMaps({ url: job.locationImageUrl });
		await pending;
		expect(createdBeforeReady).toBe(0);
	});

	it("waits for contact readiness before creating the job", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		let resolveContact!: (contact: Awaited<ReturnType<ContactService["getOrAddContact"]>>) => void;
		const contact = new Promise<Awaited<ReturnType<ContactService["getOrAddContact"]>>>((resolve) => {
			resolveContact = resolve;
		});
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenReturn(contact);
		const pending = service.createJob(params);
		await vi.waitUntil(() => td.explain(contacts.getOrAddContact).callCount === 1);
		const createdBeforeReady = td.explain(repository.createJob).callCount;
		resolveContact({ contactId: job.contact.id, method: dto.contact.method, identifier: dto.contact.identifier });
		await pending;
		expect(createdBeforeReady).toBe(0);
	});

	it("persists the prepared contact after it becomes ready", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		let resolveContact!: (contact: Awaited<ReturnType<ContactService["getOrAddContact"]>>) => void;
		const contact = new Promise<Awaited<ReturnType<ContactService["getOrAddContact"]>>>((resolve) => {
			resolveContact = resolve;
		});
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenReturn(contact);
		const pending = service.createJob(params);
		await vi.waitUntil(() => td.explain(contacts.getOrAddContact).callCount === 1);
		resolveContact({ contactId: job.contact.id, method: dto.contact.method, identifier: dto.contact.identifier });
		await pending;
		expect(td.explain(repository.createJob).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ contactId: job.contact.id }),
		]);
	});

	it("returns the contact preparation failure to the caller", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		const error = new Error("Contact unavailable");
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenReject(error);
		await expect(service.createJob(params)).rejects.toBe(error);
	});

	it("does not create a job when parallel contact preparation fails", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		const error = new Error("Contact unavailable");
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenReject(error);
		await service.createJob(params).catch(() => undefined);
		expect(td.explain(repository.createJob).callCount).toBe(0);
	});

	it.each([JobStatus.ACTIVE, JobStatus.ARCHIVED])(
		"returns the poster's %s job with fuzzy location and real contact",
		async (status) => {
			td.when(repository.findProfileJobById(td.matchers.anything())).thenResolve({
				...job,
				status: status,
				locationTitle: "Rua Pardal Branco, 32",
				contact: { contactMethod: "WHATSAPP", identifier: "+5511999999999" },
			});
			const result = await service.getProfileJob({ jobId: job.id, posterProfileId: params.posterProfileId });
			expect(result).toEqual({
				jobId: job.id,
				description: job.description,
				contact: { method: "WHATSAPP", identifier: "+5511999999999" },
				location: {
					title: "Rua Pardal Branco, 32",
					latitude: -23.55,
					longitude: -46.63,
					areaRadius: 2_000,
					imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
				},
				status: status,
				createdAt: "2026-09-22T12:00:00.000Z",
				updatedAt: "2026-09-22T12:00:00.000Z",
			});
		},
	);

	it.each([JobStatus.ACTIVE, JobStatus.ARCHIVED])("scopes the %s job lookup to its poster", async (status) => {
		td.when(repository.findProfileJobById(td.matchers.anything())).thenResolve({
			...job,
			status: status,
			locationTitle: "Rua Pardal Branco, 32",
			contact: { contactMethod: "WHATSAPP", identifier: "+5511999999999" },
		});
		await service.getProfileJob({ jobId: job.id, posterProfileId: params.posterProfileId });

		expect(td.explain(repository.findProfileJobById).calls.map((call) => call.args)).toContainEqual([
			{ jobId: job.id, posterProfileId: params.posterProfileId },
		]);
	});

	it("returns the owned job with null contact after its linked contact was removed", async () => {
		td.when(repository.findProfileJobById(td.matchers.anything())).thenResolve({
			...job,
			locationTitle: "legacy-location-" + job.id,
			contact: null,
		});
		await expect(
			service.getProfileJob({ jobId: job.id, posterProfileId: params.posterProfileId }),
		).resolves.toMatchObject({
			contact: null,
			location: { title: "legacy-location-" + job.id },
		});
	});

	it.each([
		{ scenario: "missing", jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", posterProfileId: params.posterProfileId },
		{ scenario: "another poster's", jobId: job.id, posterProfileId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
	])("returns the same 404 for a $scenario job", async ({ jobId, posterProfileId }) => {
		td.when(repository.findProfileJobById(td.matchers.anything())).thenResolve(null);
		await expect(service.getProfileJob({ jobId: jobId, posterProfileId: posterProfileId })).rejects.toThrow(
			JobNotFoundError,
		);
	});

	it.each([
		{ scenario: "missing", jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", posterProfileId: params.posterProfileId },
		{ scenario: "another poster's", jobId: job.id, posterProfileId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
	])("scopes a $scenario job lookup to the supplied poster", async ({ jobId, posterProfileId }) => {
		td.when(repository.findProfileJobById(td.matchers.anything())).thenResolve(null);
		await service.getProfileJob({ jobId: jobId, posterProfileId: posterProfileId }).catch(() => undefined);
		expect(td.explain(repository.findProfileJobById).calls.map((call) => call.args)).toContainEqual([
			{ jobId: jobId, posterProfileId: posterProfileId },
		]);
	});

	it("returns an empty page when the poster has no jobs", async () => {
		td.when(repository.findProfileJobs(td.matchers.anything())).thenResolve([]);
		const result = await service.getProfileJobs({ posterProfileId: params.posterProfileId });
		expect(result).toMatchObject({ data: [], pagination: { hasMore: false, nextCursor: null } });
	});

	it("limits the initial owned job query to one page and its lookahead", async () => {
		td.when(repository.findProfileJobs(td.matchers.anything())).thenResolve([]);
		await service.getProfileJobs({ posterProfileId: params.posterProfileId });

		expect(td.explain(repository.findProfileJobs).calls.map((call) => call.args)).toContainEqual([
			{
				posterProfileId: params.posterProfileId,
				cursor: undefined,
				limit: 21,
			},
		]);
	});

	it("returns active and archived posts with their list fields", async () => {
		td.when(repository.findProfileJobs(td.matchers.anything())).thenResolve([
			job,
			{
				...job,
				id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				status: JobStatus.ARCHIVED,
			},
		]);
		const result = await service.getProfileJobs({ posterProfileId: params.posterProfileId });
		expect(result.data).toEqual([
			{
				jobId: job.id,
				title: job.title,
				descriptionSummary: job.descriptionSummary,
				payment: job.payment,
				location: {
					latitude: -23.55,
					longitude: -46.63,
					areaRadius: 2_000,
					imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
				},
				status: JobStatus.ACTIVE,
				createdAt: "2026-09-22T12:00:00.000Z",
				updatedAt: "2026-09-22T12:00:00.000Z",
			},
			expect.objectContaining({
				status: JobStatus.ARCHIVED,
				location: {
					latitude: -23.55,
					longitude: -46.63,
					areaRadius: 2_000,
					imageUrl: "https://imagedelivery.net/test/map/format=webp,quality=80",
				},
			}),
		]);
	});

	it("returns the archived job to its poster", async () => {
		td.when(repository.archiveOwnedJob(td.matchers.anything())).thenResolve({ ...job, status: JobStatus.ARCHIVED });
		await expect(service.archiveJob({ jobId: job.id, posterProfileId: params.posterProfileId })).resolves.toMatchObject(
			{
				status: "ARCHIVED",
			},
		);
	});

	it("keeps archived public job detail available", async () => {
		td.when(repository.archiveOwnedJob(td.matchers.anything())).thenResolve({ ...job, status: JobStatus.ARCHIVED });
		td.when(repository.findPublicById(td.matchers.anything())).thenResolve({ ...job, status: JobStatus.ARCHIVED });
		await service.archiveJob({ jobId: job.id, posterProfileId: params.posterProfileId });
		await expect(service.getPublicJob({ jobId: job.id })).resolves.toMatchObject({ status: "ARCHIVED" });
	});

	it("returns 404 when a different poster archives a job", async () => {
		td.when(repository.archiveOwnedJob(td.matchers.anything())).thenResolve(null);
		await expect(service.archiveJob({ jobId: job.id, posterProfileId: "other" })).rejects.toThrow(JobNotFoundError);
	});

	it("returns an active job with its original creation time after activation", async () => {
		td.when(repository.activateOwnedJob(td.matchers.anything())).thenResolve({ ...job, status: JobStatus.ACTIVE });
		await expect(
			service.activateJob({ jobId: job.id, posterProfileId: params.posterProfileId }),
		).resolves.toMatchObject({
			status: JobStatus.ACTIVE,
			createdAt: "2026-09-22T12:00:00.000Z",
		});
	});

	it("scopes job activation to its poster", async () => {
		td.when(repository.activateOwnedJob(td.matchers.anything())).thenResolve({ ...job, status: JobStatus.ACTIVE });
		await service.activateJob({ jobId: job.id, posterProfileId: params.posterProfileId });
		expect(td.explain(repository.activateOwnedJob).calls.map((call) => call.args)).toContainEqual([
			{ jobId: job.id, posterProfileId: params.posterProfileId },
		]);
	});

	it("returns 404 for a missing job during activation", async () => {
		td.when(repository.activateOwnedJob(td.matchers.anything())).thenResolve(null);
		await expect(service.activateJob({ jobId: job.id, posterProfileId: params.posterProfileId })).rejects.toThrow(
			JobNotFoundError,
		);
	});

	it("returns 404 for an unowned job during activation", async () => {
		td.when(repository.activateOwnedJob(td.matchers.anything())).thenResolve(null);
		await expect(service.activateJob({ jobId: job.id, posterProfileId: "other" })).rejects.toThrow(JobNotFoundError);
	});

	it("refuses contact lookup for an archived job even when another active job shares its contact", async () => {
		td.when(repository.findActiveJobContact(td.matchers.anything())).thenResolve(null);
		await expect(service.getJobContact({ jobId: job.id, contactId: job.contact.id })).rejects.toThrow(JobNotFoundError);
	});

	it("scopes contact lookup to both the job and contact", async () => {
		td.when(repository.findActiveJobContact(td.matchers.anything())).thenResolve(null);
		await service.getJobContact({ jobId: job.id, contactId: job.contact.id }).catch(() => undefined);
		expect(td.explain(repository.findActiveJobContact).calls.map((call) => call.args)).toContainEqual([
			{ jobId: job.id, contactId: job.contact.id },
		]);
	});

	it("returns contact details for an active job's matching contact", async () => {
		td.when(repository.findActiveJobContact(td.matchers.anything())).thenResolve({
			contactMethod: "WHATSAPP",
			identifier: "+5511999999999",
		});
		await expect(service.getJobContact({ jobId: job.id, contactId: job.contact.id })).resolves.toEqual({
			method: "WHATSAPP",
			identifier: "+5511999999999",
		});
	});

	it("returns 20 jobs when another page exists", async () => {
		const jobs = Array.from({ length: 21 }, (_, index) => ({
			...job,
			id: `bbbbbbbb-bbbb-4bbb-8bbb-${index.toString(16).padStart(12, "0")}`,
		}));
		td.when(repository.findProfileJobs(td.matchers.anything())).thenResolve(jobs);
		const result = await service.getProfileJobs({ posterProfileId: params.posterProfileId });
		expect(result.data).toHaveLength(20);
	});

	it("reports that another owned job page exists", async () => {
		const jobs = Array.from({ length: 21 }, (_, index) => ({
			...job,
			id: `bbbbbbbb-bbbb-4bbb-8bbb-${index.toString(16).padStart(12, "0")}`,
		}));
		td.when(repository.findProfileJobs(td.matchers.anything())).thenResolve(jobs);
		const result = await service.getProfileJobs({ posterProfileId: params.posterProfileId });

		expect(result.pagination.hasMore).toBe(true);
	});

	it("encodes the last visible job in the next page cursor", async () => {
		const jobs = Array.from({ length: 21 }, (_, index) => ({
			...job,
			id: `bbbbbbbb-bbbb-4bbb-8bbb-${index.toString(16).padStart(12, "0")}`,
		}));
		td.when(repository.findProfileJobs(td.matchers.anything())).thenResolve(jobs);
		const result = await service.getProfileJobs({ posterProfileId: params.posterProfileId });

		expect(decodeProfileJobsCursor({ cursor: result.pagination.nextCursor! })).toEqual({
			version: 1,
			createdAt: "2026-09-22T12:00:00.000Z",
			jobId: jobs[19]?.id,
		});
	});

	it("decodes an owned job cursor before querying", async () => {
		td.when(repository.findProfileJobs(td.matchers.anything())).thenResolve([]);
		const cursor = encodeProfileJobsCursor({ createdAt: "2026-09-22T12:00:00.000Z", jobId: job.id });
		await service.getProfileJobs({ posterProfileId: params.posterProfileId, cursor: cursor });
		expect(td.explain(repository.findProfileJobs).calls.map((call) => call.args)).toContainEqual([
			{
				posterProfileId: params.posterProfileId,
				cursor: { version: 1, createdAt: "2026-09-22T12:00:00.000Z", jobId: job.id },
				limit: 21,
			},
		]);
	});

	it("rejects malformed owned job cursors", async () => {
		await expect(
			service.getProfileJobs({ posterProfileId: params.posterProfileId, cursor: "invalid" }),
		).rejects.toThrow();
	});

	it("returns the created active post with derived payment", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		const result = await service.createJob(params);
		expect(result).toMatchObject({ jobId: job.id, payment: job.payment, status: "ACTIVE" });
	});

	it("derives job data once before creating the active post", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		await service.createJob(params);

		expect(td.explain(ai.generateObject).callCount).toBe(1);
	});

	it("persists the derived payment, description, selected location, reservation and map reference", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve(derivedJobData);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(repository.reservePostRequest(td.matchers.anything())).thenResolve({
			...reservation,
			id: "request",
			requestHash: createHash("sha256").update(JSON.stringify(dto)).digest("hex"),
			job: null,
			fuzzyLatitude: new Prisma.Decimal(-23.55),
			fuzzyLongitude: new Prisma.Decimal(-46.63),
		});
		await service.createJob(params);

		expect(td.explain(repository.createJob).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({
				payment: job.payment,
				description: dto.description,
				location: dto.location,
				postRequestId: "request",
				locationImageUrl: job.locationImageUrl,
			}),
		]);
	});

	it("rejects an idempotent retry whose selected location title changed", async () => {
		const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: job,
			requestHash: requestHash,
		});
		await expect(
			service.createJob({
				...params,
				dto: { ...dto, location: { ...dto.location, title: "Outra rua" } },
			}),
		).rejects.toBeInstanceOf(JobIdempotencyConflictError);
	});

	it("persists null when the description does not state compensation", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve({
			title: job.title,
			description_summary: job.descriptionSummary,
			payment: null,
		});
		td.when(repository.createJob(td.matchers.anything())).thenResolve({ ...job, payment: null });
		await service.createJob({
			...params,
			dto: { ...dto, description: "Preciso de ajuda para descarregar caixas amanhã." },
		});
		expect(td.explain(repository.createJob).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ payment: null }),
		]);
	});

	it("returns null payment when the description does not state compensation", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve({
			title: job.title,
			description_summary: job.descriptionSummary,
			payment: null,
		});
		td.when(repository.createJob(td.matchers.anything())).thenResolve({ ...job, payment: null });
		const result = await service.createJob({
			...params,
			dto: { ...dto, description: "Preciso de ajuda para descarregar caixas amanhã." },
		});

		expect(result.payment).toBeNull();
	});

	it("normalizes whitespace-only derived payment to null before writing the job", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve({
			title: job.title,
			description_summary: job.descriptionSummary,
			payment: "   ",
		});
		await service.createJob(params);
		expect(td.explain(repository.createJob).calls.map((call) => call.args)).toContainEqual([
			expect.objectContaining({ payment: null }),
		]);
	});

	it("rejects a missing derived payment field", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve({
			title: job.title,
			description_summary: job.descriptionSummary,
		});
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("does not write a job when its derived payment field is missing", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenResolve({
			title: job.title,
			description_summary: job.descriptionSummary,
		});
		await service.createJob(params).catch(() => undefined);
		expect(td.explain(repository.createJob).callCount).toBe(0);
	});

	it("returns the original post on an identical retry", async () => {
		const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: job,
			requestHash: requestHash,
		});
		expect((await service.createJob(params)).jobId).toBe(job.id);
	});

	it("does not derive again on an identical completed posting retry", async () => {
		const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: job,
			requestHash: requestHash,
		});
		await service.createJob(params);

		expect(td.explain(ai.generateObject).callCount).toBe(0);
	});

	it("does not write another job on an identical completed posting retry", async () => {
		const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: job,
			requestHash: requestHash,
		});
		await service.createJob(params);

		expect(td.explain(repository.createJob).callCount).toBe(0);
	});

	it("rejects a reused key with different post content", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: job,
			requestHash: "0".repeat(64),
		});
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobIdempotencyConflictError);
	});

	it("returns an unavailable outcome when derivation fails", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenReject(
			new Error("gateway unavailable"),
		);
		await expect(service.createJob(params)).rejects.toBeInstanceOf(JobDataDerivationUnavailableError);
	});

	it("leaves no job when derivation fails", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenDo(
			async (
				input: Parameters<JobRepository["reservePostRequest"]>[0],
			): ReturnType<JobRepository["reservePostRequest"]> => ({
				...reservation,
				requestHash: input.requestHash,
			}),
		);
		td.when(getStaticMapLocationUrl(td.matchers.anything())).thenResolve({ url: job.locationImageUrl });
		td.when(contacts.getOrAddContact(td.matchers.anything())).thenResolve(savedContact);
		td.when(repository.createJob(td.matchers.anything())).thenResolve(job);
		td.when(ai.generateObject<typeof JobDerivedDataSchema>(td.matchers.anything())).thenReject(
			new Error("gateway unavailable"),
		);
		await service.createJob(params).catch(() => undefined);
		expect(td.explain(repository.createJob).callCount).toBe(0);
	});

	it("returns the original null-payment post on an identical retry", async () => {
		const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: { ...job, payment: null },
			requestHash: requestHash,
		});
		expect((await service.createJob(params)).payment).toBeNull();
	});

	it("does not derive again on an identical null-payment posting retry", async () => {
		const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: { ...job, payment: null },
			requestHash: requestHash,
		});
		await service.createJob(params);

		expect(td.explain(ai.generateObject).callCount).toBe(0);
	});

	it("does not write another job on an identical null-payment posting retry", async () => {
		const requestHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve({
			...reservation,
			job: { ...job, payment: null },
			requestHash: requestHash,
		});
		await service.createJob(params);

		expect(td.explain(repository.createJob).callCount).toBe(0);
	});

	it("returns a concurrently completed reservation without generating another map", async () => {
		td.when(repository.findByIdempotencyKey(td.matchers.anything())).thenResolve(null);
		td.when(location.fuzzCoordinate(td.matchers.anything())).thenReturn(dto.location);
		td.when(repository.reservePostRequest(td.matchers.anything())).thenResolve({
			...reservation,
			job: job,
			requestHash: createHash("sha256").update(JSON.stringify(dto)).digest("hex"),
		});
		await service.createJob(params);
		expect(td.explain(getStaticMapLocationUrl).callCount).toBe(0);
	});
	it("returns the stored signed URL when reading a saved job", async () => {
		td.when(repository.findPublicById(td.matchers.anything())).thenResolve(job);
		const result = await service.getPublicJob({ jobId: job.id });
		expect(result.location.imageUrl).toBe(job.locationImageUrl);
	});

	it("does not call Maps when reading a saved job", async () => {
		td.when(repository.findPublicById(td.matchers.anything())).thenResolve(job);
		await service.getPublicJob({ jobId: job.id });

		expect(td.explain(getStaticMapLocationUrl).callCount).toBe(0);
	});
});
