import { GUARDS_METADATA, HEADERS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";
import { UserRateLimitGuard } from "../../core/guards/user-rate-limit.guard";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { JobController } from "./job.controller";
import { JobService } from "./job.service";

describe("JobController lifecycle routes", () => {
	const authSession = {
		expiresAt: new Date("2026-08-08T19:15:00.000Z"),
		sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	};
	let controller: JobController;
	let jobService: {
		createDraft: ReturnType<typeof vi.fn>;
		updateDraft: ReturnType<typeof vi.fn>;
		updatePublicJob: ReturnType<typeof vi.fn>;
		publishJob: ReturnType<typeof vi.fn>;
		getPublicJob: ReturnType<typeof vi.fn>;
		getActiveJobContact: ReturnType<typeof vi.fn>;
	};

	beforeEach(async () => {
		jobService = {
			createDraft: vi.fn(),
			updateDraft: vi.fn(),
			updatePublicJob: vi.fn(),
			publishJob: vi.fn(),
			getPublicJob: vi.fn(),
			getActiveJobContact: vi.fn(),
		};
		const module = await Test.createTestingModule({
			controllers: [JobController],
			providers: [{ provide: JobService, useValue: jobService }],
		})
			.overrideGuard(AccessTokenGuard)
			.useValue({ canActivate: vi.fn() })
			.overrideGuard(UserRateLimitGuard)
			.useValue({ canActivate: vi.fn() })
			.compile();

		controller = module.get(JobController);
	});

	it("should expose jobs through the plural REST resource", () => {
		expect(Reflect.getMetadata(PATH_METADATA, JobController)).toBe("jobs");
	});

	it("should expose draft creation through the drafts collection", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.createDraft)).toBe("drafts");
	});

	it("should limit draft creation to twenty requests per hour per user", () => {
		expect({
			requests: Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller.createDraft),
			ttl: Reflect.getMetadata(`${THROTTLER_TTL}default`, controller.createDraft),
		}).toEqual({ requests: 20, ttl: 3_600_000 });
	});

	it("should expose draft updates through the draft resource", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.updateDraft)).toBe("drafts/:jobId");
	});

	it("should expose public job updates through the public job resource", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.updatePublicJob)).toBe(":jobId");
	});

	it("should expose publication at the job publish action", () => {
		expect(Reflect.getMetadata(PATH_METADATA, controller.publish)).toBe(":jobId/publish");
	});

	it.each([
		["draft creation", "createDraft"],
		["draft updates", "updateDraft"],
		["public job updates", "updatePublicJob"],
		["job publication", "publish"],
	] as const)("should authenticate before enforcing the user limit for %s", (_name, methodName) => {
		const guards = Reflect.getMetadata(GUARDS_METADATA, controller[methodName]) as unknown[];

		expect(guards).toEqual([AccessTokenGuard, UserRateLimitGuard]);
	});

	it("should apply the same per-user update budget to draft updates", () => {
		expect({
			requests: Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller.updateDraft),
			ttl: Reflect.getMetadata(`${THROTTLER_TTL}default`, controller.updateDraft),
		}).toEqual({ requests: 60, ttl: 3_600_000 });
	});

	it("should apply the same per-user update budget to public job updates", () => {
		expect({
			requests: Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller.updatePublicJob),
			ttl: Reflect.getMetadata(`${THROTTLER_TTL}default`, controller.updatePublicJob),
		}).toEqual({ requests: 60, ttl: 3_600_000 });
	});

	it("should limit publication to twenty requests per hour per user", () => {
		expect({
			requests: Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller.publish),
			ttl: Reflect.getMetadata(`${THROTTLER_TTL}default`, controller.publish),
		}).toEqual({ requests: 20, ttl: 3_600_000 });
	});

	it("should pass only the draft description and authenticated owner to creation", async () => {
		const dto = { description: "Descrição original da oportunidade." };

		await controller.createDraft(dto, authSession);

		expect(jobService.createDraft).toHaveBeenCalledWith({ dto: dto, posterUserId: authSession.userId });
	});

	it("should pass draft PATCH input and the authenticated owner to the draft service path", async () => {
		const params = { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
		const dto = { description: "Nova descrição da oportunidade." };

		await controller.updateDraft(params, dto, authSession);

		expect(jobService.updateDraft).toHaveBeenCalledWith({
			jobId: params.jobId,
			updatedDto: dto,
			posterUserId: authSession.userId,
		});
	});

	it("should pass public PATCH input and the authenticated owner to the public service path", async () => {
		const params = { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
		const dto = { description: "Nova descrição pública da oportunidade." };

		await controller.updatePublicJob(params, dto, authSession);

		expect(jobService.updatePublicJob).toHaveBeenCalledWith({
			jobId: params.jobId,
			updatedDto: dto,
			posterUserId: authSession.userId,
		});
	});

	it("should pass the draft ID and authenticated owner to publication", async () => {
		const params = { jobId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

		await controller.publish(params, authSession);

		expect(jobService.publishJob).toHaveBeenCalledWith({
			jobId: params.jobId,
			posterUserId: authSession.userId,
		});
	});

	it("should prevent full contact responses from being cached", () => {
		expect(Reflect.getMetadata(HEADERS_METADATA, controller.getJobContact)).toContainEqual({
			name: "Cache-Control",
			value: "no-store",
		});
	});
});
