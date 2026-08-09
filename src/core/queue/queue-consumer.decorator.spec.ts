import { HttpStatus, RequestMethod, VERSION_NEUTRAL } from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { QueueConsumer } from "./queue-consumer.decorator";

describe("QueueConsumer", () => {
	it("should expose the Queue consumer under its registered Queue name", () => {
		class TestQueueController {
			@QueueConsumer("cataqui-api-derive-job-data")
			consume(): void {}
		}

		expect(Reflect.getMetadata(PATH_METADATA, TestQueueController.prototype.consume)).toBe(
			"cataqui-api-derive-job-data",
		);
	});

	it("should register Queue consumers as POST endpoints", () => {
		class TestQueueController {
			@QueueConsumer("cataqui-api-derive-job-data")
			consume(): void {}
		}

		expect(Reflect.getMetadata(METHOD_METADATA, TestQueueController.prototype.consume)).toBe(RequestMethod.POST);
	});

	it("should keep Queue consumers outside public URI versioning", () => {
		class TestQueueController {
			@QueueConsumer("cataqui-api-derive-job-data")
			consume(): void {}
		}

		expect(Reflect.getMetadata(VERSION_METADATA, TestQueueController.prototype.consume)).toBe(VERSION_NEUTRAL);
	});

	it("should return no content after a Queue message is accepted", () => {
		class TestQueueController {
			@QueueConsumer("cataqui-api-derive-job-data")
			consume(): void {}
		}

		expect(Reflect.getMetadata(HTTP_CODE_METADATA, TestQueueController.prototype.consume)).toBe(HttpStatus.NO_CONTENT);
	});
});
