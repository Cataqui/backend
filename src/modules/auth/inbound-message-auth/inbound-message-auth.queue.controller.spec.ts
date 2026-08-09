import { VERSION_NEUTRAL, VersioningType } from "@nestjs/common";
import { PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { InboundMessageAuthChannel } from "./enums/inbound-message-auth-channel.enum";
import { InboundMessageAuthQueueController } from "./inbound-message-auth.queue.controller";
import { InboundMessageAuthService } from "./inbound-message-auth.service";

describe("InboundMessageAuthQueueController", () => {
	let controller: InboundMessageAuthQueueController;
	let testingModule: TestingModule;
	let inboundMessageAuthService: { verifyAuthMessage: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		inboundMessageAuthService = { verifyAuthMessage: vi.fn() };
		testingModule = await Test.createTestingModule({
			controllers: [InboundMessageAuthQueueController],
			providers: [{ provide: InboundMessageAuthService, useValue: inboundMessageAuthService }],
		}).compile();
		controller = testingModule.get(InboundMessageAuthQueueController);
	});

	it("should expose WhatsApp delivery at its typed Queue consumer route", () => {
		expect({
			controllerPath: Reflect.getMetadata(PATH_METADATA, InboundMessageAuthQueueController),
			methodPath: Reflect.getMetadata(
				PATH_METADATA,
				InboundMessageAuthQueueController.prototype.verifyWhatsappAuthMessage,
			),
		}).toEqual({
			controllerPath: "internal/queues",
			methodPath: "cataqui-api-verify-whatsapp-auth-message",
		});
	});

	it("should keep Queue delivery outside public URI versioning", () => {
		expect(
			Reflect.getMetadata(VERSION_METADATA, InboundMessageAuthQueueController.prototype.verifyWhatsappAuthMessage),
		).toBe(VERSION_NEUTRAL);
	});

	it("should accept the exact unversioned path called by the Queue consumer", async () => {
		inboundMessageAuthService.verifyAuthMessage.mockResolvedValue(undefined);
		const app = testingModule.createNestApplication(new FastifyAdapter());
		app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
		await app.init();

		const response = await app
			.getHttpAdapter()
			.getInstance()
			.inject({
				method: "POST",
				url: "/internal/queues/cataqui-api-verify-whatsapp-auth-message",
				payload: {
					providerMessageId: "wamid.message",
					providerSenderId: "5511999999999",
					providerContactIdentifier: "+5511999999999",
					authCodeHash: "a".repeat(64),
				},
			});
		await app.close();

		expect(response.statusCode).toBe(204);
	});

	it("should pass the authentication code to the shared verification workflow without sending a reply", async () => {
		inboundMessageAuthService.verifyAuthMessage.mockResolvedValue(undefined);

		await controller.verifyWhatsappAuthMessage({
			providerMessageId: "wamid.message",
			providerSenderId: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			providerContactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});

		expect(inboundMessageAuthService.verifyAuthMessage).toHaveBeenCalledWith({
			channel: InboundMessageAuthChannel.WHATSAPP,
			providerMessageId: "wamid.message",
			providerSubject: "user.9373795779eb6441c8adb2eaee5b848e7dd174ddd302d7db62142f4722d574b6",
			contactIdentifier: "+5511999999999",
			authCodeHash: "a".repeat(64),
		});
	});

	it("should propagate verification failures so Queue delivery can retry", async () => {
		inboundMessageAuthService.verifyAuthMessage.mockRejectedValue(new Error("redis unavailable"));

		await expect(
			controller.verifyWhatsappAuthMessage({
				providerMessageId: "wamid.message",
				providerSenderId: "5511999999999",
				providerContactIdentifier: "+5511999999999",
				authCodeHash: "a".repeat(64),
			}),
		).rejects.toThrow("redis unavailable");
	});
});
