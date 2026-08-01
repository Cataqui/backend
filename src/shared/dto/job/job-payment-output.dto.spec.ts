import { Controller, Get, type INestApplication } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { ApiResponse, DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { instanceToPlain } from "class-transformer";
import { JobPaymentAmountPeriod, JobPaymentType } from "../../../../generated/prisma/client.js";
import { JobPaymentOutputDto } from "./job-payment-output.dto";

@Controller("payment")
class JobPaymentOutputDocsTestController {
	@Get()
	@ApiResponse({ type: JobPaymentOutputDto })
	getPayment(): void {}
}

describe("JobPaymentOutputDto", () => {
	let app: INestApplication;
	let document: OpenAPIObject;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ controllers: [JobPaymentOutputDocsTestController] }).compile();
		app = module.createNestApplication(new FastifyAdapter());
		document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
	});

	afterAll(async () => {
		await app.close();
	});

	describe("constructor", () => {
		it("should set fields for FIXED payment", () => {
			const dto = new JobPaymentOutputDto({
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: 150.0,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
				paymentCurrency: "BRL",
			});

			expect(dto.type).toBe(JobPaymentType.FIXED);
			expect(dto.minAmount).toBe(150.0);
			expect(dto.maxAmount).toBeNull();
			expect(dto.note).toBeNull();
			expect(dto.amountPeriod).toBe(JobPaymentAmountPeriod.SINGLE);
			expect(dto.currency).toBe("BRL");
		});

		it("should set fields for RANGE payment", () => {
			const dto = new JobPaymentOutputDto({
				paymentType: JobPaymentType.RANGE,
				paymentMinAmount: 100.0,
				paymentMaxAmount: 200.0,
				paymentNote: null,
				paymentAmountPeriod: JobPaymentAmountPeriod.WEEKLY,
				paymentCurrency: "USD",
			});

			expect(dto.type).toBe(JobPaymentType.RANGE);
			expect(dto.minAmount).toBe(100.0);
			expect(dto.maxAmount).toBe(200.0);
			expect(dto.note).toBeNull();
		});

		it("should set fields for OTHER payment", () => {
			const dto = new JobPaymentOutputDto({
				paymentType: JobPaymentType.OTHER,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: "Commission-based",
				paymentAmountPeriod: JobPaymentAmountPeriod.MONTHLY,
				paymentCurrency: "BRL",
			});

			expect(dto.type).toBe(JobPaymentType.OTHER);
			expect(dto.minAmount).toBeNull();
			expect(dto.maxAmount).toBeNull();
			expect(dto.note).toBe("Commission-based");
		});

		it("should extract amount from Decimal-like object", () => {
			const decimal = { toNumber: (): number => 250.0 };
			const dto = new JobPaymentOutputDto({
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: decimal,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: JobPaymentAmountPeriod.WEEKLY,
				paymentCurrency: "USD",
			});

			expect(dto.minAmount).toBe(250.0);
		});
	});

	describe("serialization", () => {
		it("should serialize FIXED payment in snake_case", () => {
			const dto = new JobPaymentOutputDto({
				paymentType: JobPaymentType.FIXED,
				paymentMinAmount: 150.0,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
				paymentCurrency: "BRL",
			});
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toEqual({
				type: "FIXED",
				min_amount: 150.0,
				max_amount: null,
				note: null,
				amount_period: "SINGLE",
				currency: "BRL",
			});
		});

		it("should preserve null fields in serialization", () => {
			const dto = new JobPaymentOutputDto({
				paymentType: JobPaymentType.FLEXIBLE,
				paymentMinAmount: null,
				paymentMaxAmount: null,
				paymentNote: null,
				paymentAmountPeriod: JobPaymentAmountPeriod.SINGLE,
				paymentCurrency: "BRL",
			});
			const plain = instanceToPlain(dto, { exposeUnsetFields: false }) as Record<string, unknown>;

			expect(plain).toEqual({
				type: "FLEXIBLE",
				min_amount: null,
				max_amount: null,
				note: null,
				amount_period: "SINGLE",
				currency: "BRL",
			});
		});
	});

	describe("documentation", () => {
		it("should document only payment values that may be absent as nullable", () => {
			const schema = document.components?.schemas?.[JobPaymentOutputDto.name];
			if (!schema || "$ref" in schema) throw new Error("JobPaymentOutputDto OpenAPI schema was not generated.");

			expect(
				Object.fromEntries(
					Object.entries(schema.properties ?? {}).map(([propertyName, propertySchema]) => [
						propertyName,
						"nullable" in propertySchema ? propertySchema.nullable === true : false,
					]),
				),
			).toEqual({
				type: false,
				min_amount: true,
				max_amount: true,
				note: true,
				amount_period: false,
				currency: false,
			});
		});
	});
});
