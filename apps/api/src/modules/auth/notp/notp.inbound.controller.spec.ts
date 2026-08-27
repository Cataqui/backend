import { VERSION_NEUTRAL, VersioningType } from "@nestjs/common";
import { VERSION_METADATA } from "@nestjs/common/constants";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { ObservabilityOperationName } from "../../../core/observability/observability-operation-name.enum";
import { ObservabilityService } from "../../../core/observability/observability.service";
import { NotpChannel } from "./enums/notp-channel.enum";
import { NotpInboundController } from "./notp.inbound.controller";
import { NotpService } from "./notp.service";

describe("NotpInboundController", () => {
	let controller: NotpInboundController;
	let testingModule: TestingModule;
	let notpService: { verifyNotp: ReturnType<typeof vi.fn> };
	let observabilityService: { observeOperation: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		notpService = { verifyNotp: vi.fn() };
		observabilityService = {
			observeOperation: vi.fn(async (params: { operation: () => Promise<unknown> }) => params.operation()),
		};
		testingModule = await Test.createTestingModule({
			controllers: [NotpInboundController],
			providers: [
				{ provide: NotpService, useValue: notpService },
				{ provide: ObservabilityService, useValue: observabilityService },
			],
		}).compile();
		controller = testingModule.get(NotpInboundController);
	});

	it("should keep direct Worker delivery outside public URI versioning", () => {
		expect(Reflect.getMetadata(VERSION_METADATA, NotpInboundController.prototype.verifyWhatsappNotp)).toBe(
			VERSION_NEUTRAL,
		);
	});

	it("should accept the exact unversioned path called by the API Worker", async () => {
		notpService.verifyNotp.mockResolvedValue(undefined);
		const app = testingModule.createNestApplication(new FastifyAdapter());
		app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
		await app.init();

		const response = await app
			.getHttpAdapter()
			.getInstance()
			.inject({
				method: "POST",
				url: "/internal/inbound/verify-whatsapp-notp",
				payload: {
					providerMessageId: "wamid.message",
					providerSenderId: "5511999999999",
					providerContactIdentifier: "+5511999999999",
					notpCodeHash: "a".repeat(64),
				},
			});
		await app.close();

		expect(response.statusCode).toBe(204);
	});

	it("should pass the WhatsApp identity and NOTP code to the shared verification workflow", async () => {
		notpService.verifyNotp.mockResolvedValue(undefined);

		await controller.verifyWhatsappNotp({
			providerMessageId: "wamid.message",
			providerSenderId: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			providerContactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});

		expect(notpService.verifyNotp).toHaveBeenCalledWith({
			channel: NotpChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});
	});

	it("should propagate verification failures to the Webhooks Worker", async () => {
		notpService.verifyNotp.mockRejectedValue(new Error("redis unavailable"));

		await expect(
			controller.verifyWhatsappNotp({
				providerMessageId: "wamid.message",
				providerSenderId: "5511999999999",
				providerContactIdentifier: "+5511999999999",
				notpCodeHash: "a".repeat(64),
			}),
		).rejects.toThrow("redis unavailable");
	});

	it("should observe WhatsApp NOTP verification through the typed operation registry", async () => {
		notpService.verifyNotp.mockResolvedValue(undefined);

		await controller.verifyWhatsappNotp({
			providerMessageId: "wamid.message",
			providerSenderId: "5511999999999",
			providerContactIdentifier: "+5511999999999",
			notpCodeHash: "a".repeat(64),
		});

		expect(observabilityService.observeOperation).toHaveBeenCalledWith({
			operation: expect.any(Function),
			operationName: ObservabilityOperationName.WHATSAPP_NOTP_VERIFICATION,
		});
	});
});
