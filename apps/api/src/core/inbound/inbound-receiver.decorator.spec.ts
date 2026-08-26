import { HttpStatus, RequestMethod, VERSION_NEUTRAL } from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { InboundReceiver } from "./inbound-receiver.decorator";

describe("InboundReceiver", () => {
	it("should expose the receiver beneath the internal inbound path", () => {
		class TestInboundController {
			@InboundReceiver("verify-whatsapp-notp")
			receive(): void {}
		}

		expect(Reflect.getMetadata(PATH_METADATA, TestInboundController.prototype.receive)).toBe(
			"internal/inbound/verify-whatsapp-notp",
		);
	});

	it("should register inbound receivers as POST endpoints", () => {
		class TestInboundController {
			@InboundReceiver("verify-whatsapp-notp")
			receive(): void {}
		}

		expect(Reflect.getMetadata(METHOD_METADATA, TestInboundController.prototype.receive)).toBe(RequestMethod.POST);
	});

	it("should keep inbound receivers outside public URI versioning", () => {
		class TestInboundController {
			@InboundReceiver("verify-whatsapp-notp")
			receive(): void {}
		}

		expect(Reflect.getMetadata(VERSION_METADATA, TestInboundController.prototype.receive)).toBe(VERSION_NEUTRAL);
	});

	it("should return no content after an inbound call is accepted", () => {
		class TestInboundController {
			@InboundReceiver("verify-whatsapp-notp")
			receive(): void {}
		}

		expect(Reflect.getMetadata(HTTP_CODE_METADATA, TestInboundController.prototype.receive)).toBe(
			HttpStatus.NO_CONTENT,
		);
	});
});
