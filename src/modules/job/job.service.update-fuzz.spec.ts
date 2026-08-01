import { FastifyAdapter } from "@nestjs/platform-fastify";
import { ApiProperty, DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { type ClassConstructor, Expose, plainToInstance, Type } from "class-transformer";
import { getMetadataStorage, validateSync, ValidateNested } from "class-validator";
import fc, { type Arbitrary } from "fast-check";
import { JobPaymentAmountPeriod, JobStatus, JobType } from "../../../generated/prisma/client.js";
import { AiService } from "../ai/ai.service";
import { MapService } from "../map/map.service";
import { DeriveJobDataPublisher } from "./derive-job-data.publisher";
import { UpdateJobRequestDto } from "./dto/update-job-request.dto";
import { JobService } from "./job.service";
import { JobRepository } from "./repositories/job.repository";

type PersistedPrimitive = boolean | null | number | string;
type OpenApiComponentSchema = NonNullable<NonNullable<OpenAPIObject["components"]>["schemas"]>[string];
type OpenApiReference = Extract<OpenApiComponentSchema, { $ref: string }>;
type OpenApiSchema = Exclude<OpenApiComponentSchema, OpenApiReference>;
type DtoClass<DTO extends object = object> = ClassConstructor<DTO>;
type DocumentedUpdateLeaf = {
	readonly fieldPath: string;
	readonly internalPath: readonly string[];
	readonly wirePath: readonly string[];
};

class MissingNestedValidationDto {
	@Expose({ name: "ignored_field" })
	@ApiProperty({ name: "ignored_field", example: "BR" })
	readonly ignoredField?: string;
}

class MissingNestedValidationRootDto {
	@Expose({ name: "nested" })
	@ApiProperty({ name: "nested", type: MissingNestedValidationDto })
	@ValidateNested()
	@Type(() => MissingNestedValidationDto)
	readonly nested!: MissingNestedValidationDto;
}

const createdAt = new Date("2026-07-30T12:00:00.000Z");
const existingJob = {
	id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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

function _asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

	return value as Record<string, unknown>;
}

function _collectPrimitiveValues(value: unknown): PersistedPrimitive[] {
	if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
		return [value];
	}

	if (Array.isArray(value)) return value.flatMap((item) => _collectPrimitiveValues(item));

	const record = _asRecord(value);
	if (record === null) return [];

	return Object.values(record).flatMap((entry) => _collectPrimitiveValues(entry));
}

function _areAllSubmittedValuesPersisted(params: { submittedValue: unknown; updateCall: unknown }): boolean {
	const updateCall = _asRecord(params.updateCall);
	if (updateCall === null) return false;

	const inputValues = _collectPrimitiveValues(params.submittedValue);
	const persistedValues = _collectPrimitiveValues({
		data: updateCall["data"],
		contact: updateCall["contact"],
		locationPoint: updateCall["locationPoint"],
	});

	if (inputValues.length === 0) return false;

	const unmatchedPersistedValues = [...persistedValues];
	return inputValues.every((inputValue) => {
		const matchingValueIndex = unmatchedPersistedValues.findIndex((persistedValue) =>
			Object.is(inputValue, persistedValue),
		);
		if (matchingValueIndex === -1) return false;

		unmatchedPersistedValues.splice(matchingValueIndex, 1);
		return true;
	});
}

function _getValueAtPropertyPath(params: { value: unknown; propertyPath: readonly string[] }): unknown {
	let currentValue = params.value;

	for (const propertyName of params.propertyPath) {
		const currentRecord = _asRecord(currentValue);
		if (currentRecord === null) return undefined;

		currentValue = currentRecord[propertyName];
	}

	return currentValue;
}

function _collectPrimitiveValuesOutsidePropertyPath(params: {
	value: unknown;
	propertyPath: readonly string[];
}): PersistedPrimitive[] {
	if (params.propertyPath.length === 0) return [];

	const record = _asRecord(params.value);
	if (record === null) return [];

	const targetPropertyName = params.propertyPath[0];
	return Object.entries(record).flatMap(([propertyName, propertyValue]) => {
		if (propertyName !== targetPropertyName) return _collectPrimitiveValues(propertyValue);

		return _collectPrimitiveValuesOutsidePropertyPath({
			value: propertyValue,
			propertyPath: params.propertyPath.slice(1),
		});
	});
}

function _isTargetValueDistinctFromOtherSubmittedValues(params: {
	updatedDto: object;
	targetPropertyPath: readonly string[];
}): boolean {
	const targetValues = _collectPrimitiveValues(
		_getValueAtPropertyPath({ value: params.updatedDto, propertyPath: params.targetPropertyPath }),
	);
	const otherValues = _collectPrimitiveValuesOutsidePropertyPath({
		value: params.updatedDto,
		propertyPath: params.targetPropertyPath,
	});

	return (
		targetValues.length > 0 &&
		targetValues.every((targetValue) => !otherValues.some((otherValue) => Object.is(targetValue, otherValue)))
	);
}

function _resolveOpenApiSchema(params: {
	schema: OpenApiComponentSchema;
	schemas: Record<string, OpenApiComponentSchema>;
}): OpenApiSchema {
	if (!("$ref" in params.schema)) {
		if (params.schema.allOf?.length === 1) {
			const allOfSchema = params.schema.allOf[0];
			if (!allOfSchema) throw new Error(`OpenAPI allOf schema is empty: ${JSON.stringify(params.schema)}`);

			return _resolveOpenApiSchema({ schema: allOfSchema, schemas: params.schemas });
		}

		return params.schema;
	}

	const schemaName = params.schema.$ref.split("/").at(-1);
	if (!schemaName) throw new Error(`OpenAPI schema reference is invalid: ${params.schema.$ref}`);

	const referencedSchema = params.schemas[schemaName];
	if (!referencedSchema) throw new Error(`OpenAPI schema reference was not found: ${params.schema.$ref}`);

	return _resolveOpenApiSchema({ schema: referencedSchema, schemas: params.schemas });
}

function _includeDocumentedExample(params: {
	arbitrary: Arbitrary<unknown>;
	schema: OpenApiSchema;
}): Arbitrary<unknown> {
	const example = params.schema.example as unknown;
	if (example === undefined) return params.arbitrary;

	return fc.oneof(fc.constant(example), fc.constant(example), fc.constant(example), params.arbitrary);
}

function _buildOpenApiSchemaArbitrary(params: {
	schema: OpenApiComponentSchema;
	schemas: Record<string, OpenApiComponentSchema>;
	requiredWirePath?: readonly string[];
}): Arbitrary<unknown> {
	const schema = _resolveOpenApiSchema({ schema: params.schema, schemas: params.schemas });
	const enumValues = schema.enum as unknown[] | undefined;

	let arbitrary: Arbitrary<unknown>;
	if (schema.allOf?.length === 1) {
		const allOfSchema = schema.allOf[0];
		if (!allOfSchema) throw new Error(`OpenAPI allOf schema is empty: ${JSON.stringify(schema)}`);

		arbitrary = _buildOpenApiSchemaArbitrary({
			schema: allOfSchema,
			schemas: params.schemas,
			...(params.requiredWirePath !== undefined && { requiredWirePath: params.requiredWirePath }),
		});
	} else if (schema.allOf && schema.allOf.length > 1) {
		throw new Error(`OpenAPI allOf schemas with multiple members are not supported: ${JSON.stringify(schema)}`);
	} else if (enumValues && enumValues.length > 0) {
		arbitrary = fc.constantFrom(...enumValues);
	} else if (schema.type === "string") {
		arbitrary = fc.string({
			minLength: schema.minLength ?? 0,
			maxLength: Math.min(schema.maxLength ?? 200, 200),
		});
	} else if (schema.type === "integer") {
		arbitrary = fc.integer({
			...(schema.minimum !== undefined && { min: schema.minimum }),
			...(schema.maximum !== undefined && { max: schema.maximum }),
		});
	} else if (schema.type === "number") {
		arbitrary = fc.double({
			...(schema.minimum !== undefined && { min: schema.minimum }),
			...(schema.maximum !== undefined && { max: schema.maximum }),
			noDefaultInfinity: true,
			noNaN: true,
		});
	} else if (schema.type === "boolean") {
		arbitrary = fc.boolean();
	} else if (schema.type === "array" && schema.items) {
		arbitrary = fc.array(
			_buildOpenApiSchemaArbitrary({
				schema: schema.items,
				schemas: params.schemas,
				...(params.requiredWirePath !== undefined && { requiredWirePath: params.requiredWirePath }),
			}),
			{
				...(schema.minItems !== undefined && { minLength: schema.minItems }),
				...(schema.maxItems !== undefined && { maxLength: schema.maxItems }),
			},
		);
	} else if (schema.type === "object" || schema.properties) {
		const propertyArbitraries = Object.fromEntries(
			Object.entries(schema.properties ?? {}).map(([propertyName, propertySchema]) => [
				propertyName,
				_buildOpenApiSchemaArbitrary({
					schema: propertySchema,
					schemas: params.schemas,
					...(params.requiredWirePath?.[0] === propertyName && {
						requiredWirePath: params.requiredWirePath.slice(1),
					}),
				}),
			]),
		) as Record<string, Arbitrary<unknown>>;
		const requiredKeys = new Set(schema.required ?? []);
		const requiredPropertyName = params.requiredWirePath?.[0];
		if (requiredPropertyName !== undefined) requiredKeys.add(requiredPropertyName);

		arbitrary = fc.record(propertyArbitraries, {
			requiredKeys: [...requiredKeys],
			noNullPrototype: true,
		});
	} else if (schema.example !== undefined) {
		arbitrary = fc.constant(schema.example as unknown);
	} else {
		throw new Error(`OpenAPI schema cannot be converted to a fast-check arbitrary: ${JSON.stringify(schema)}`);
	}

	const arbitraryWithExample = _includeDocumentedExample({ arbitrary: arbitrary, schema: schema });
	if (!schema.nullable) return arbitraryWithExample;

	return fc.oneof(fc.constant(null), arbitraryWithExample);
}

function _getDtoSchema(params: { document: OpenAPIObject; dtoClass: DtoClass }): {
	schema: OpenApiSchema;
	schemas: Record<string, OpenApiComponentSchema>;
} {
	const schemas = params.document.components?.schemas;
	if (!schemas) throw new Error("Generated OpenAPI document does not contain component schemas.");

	const dtoSchema = schemas[params.dtoClass.name];
	if (!dtoSchema) {
		throw new Error(`Generated OpenAPI document does not contain ${params.dtoClass.name}.`);
	}

	return {
		schema: _resolveOpenApiSchema({ schema: dtoSchema, schemas: schemas }),
		schemas: schemas,
	};
}

function _getInternalPropertyName(params: { dtoClass: DtoClass; wirePropertyName: string }): string {
	const transformedDto = plainToInstance(
		params.dtoClass,
		{ [params.wirePropertyName]: "schema-probe" },
		{ excludeExtraneousValues: true },
	);
	const matchingProperties = Object.entries(transformedDto).filter(([, value]) => value === "schema-probe");
	const internalPropertyName = matchingProperties[0]?.[0];

	if (matchingProperties.length !== 1 || internalPropertyName === undefined) {
		throw new Error(
			`${params.dtoClass.name}.${params.wirePropertyName} must transform to exactly one internal DTO property.`,
		);
	}

	return internalPropertyName;
}

function _collectDtoContractErrors(params: {
	dtoClass: DtoClass;
	schema: OpenApiComponentSchema;
	schemas: Record<string, OpenApiComponentSchema>;
	fieldPath?: readonly string[];
}): string[] {
	const schema = _resolveOpenApiSchema({ schema: params.schema, schemas: params.schemas });
	const documentedProperties = Object.entries(schema.properties ?? {}).map(([wirePropertyName, propertySchema]) => ({
		internalPropertyName: _getInternalPropertyName({
			dtoClass: params.dtoClass,
			wirePropertyName: wirePropertyName,
		}),
		propertySchema: propertySchema,
		wirePropertyName: wirePropertyName,
	}));
	const documentedInternalPropertyNames = new Set(
		documentedProperties.map(({ internalPropertyName }) => internalPropertyName),
	);
	const validatedPropertyNames = new Set(
		getMetadataStorage()
			.getTargetValidationMetadatas(params.dtoClass, "", false, false, undefined)
			.map((metadata) => metadata.propertyName),
	);
	const fieldPath = params.fieldPath ?? [];
	const errors: string[] = [];

	for (const documentedProperty of documentedProperties) {
		if (!validatedPropertyNames.has(documentedProperty.internalPropertyName)) {
			errors.push(
				`${[...fieldPath, documentedProperty.wirePropertyName].join(".")} is documented but has no validation metadata`,
			);
		}
	}

	for (const validatedPropertyName of validatedPropertyNames) {
		if (!documentedInternalPropertyNames.has(validatedPropertyName)) {
			errors.push(
				`${[...fieldPath, validatedPropertyName].join(".")} is validated but missing from the OpenAPI schema`,
			);
		}
	}

	for (const documentedProperty of documentedProperties) {
		const nestedSchema = _resolveOpenApiSchema({
			schema: documentedProperty.propertySchema,
			schemas: params.schemas,
		});
		if (!nestedSchema.properties) continue;

		const reflectedNestedDtoClass: unknown = Reflect.getMetadata(
			"design:type",
			params.dtoClass.prototype,
			documentedProperty.internalPropertyName,
		);
		if (typeof reflectedNestedDtoClass !== "function") {
			errors.push(`${[...fieldPath, documentedProperty.wirePropertyName].join(".")} has no nested DTO type metadata`);
			continue;
		}

		errors.push(
			..._collectDtoContractErrors({
				dtoClass: reflectedNestedDtoClass as DtoClass,
				schema: documentedProperty.propertySchema,
				schemas: params.schemas,
				fieldPath: [...fieldPath, documentedProperty.wirePropertyName],
			}),
		);
	}

	return errors;
}

function _collectDocumentedUpdateLeaves(params: {
	dtoClass: DtoClass;
	schema: OpenApiComponentSchema;
	schemas: Record<string, OpenApiComponentSchema>;
	internalPath?: readonly string[];
	wirePath?: readonly string[];
}): DocumentedUpdateLeaf[] {
	const schema = _resolveOpenApiSchema({ schema: params.schema, schemas: params.schemas });
	const properties = Object.entries(schema.properties ?? {});
	const internalPath = params.internalPath ?? [];
	const wirePath = params.wirePath ?? [];

	if (properties.length === 0) {
		return [{ fieldPath: wirePath.join("."), internalPath: internalPath, wirePath: wirePath }];
	}

	return properties.flatMap(([wirePropertyName, propertySchema]) => {
		const internalPropertyName = _getInternalPropertyName({
			dtoClass: params.dtoClass,
			wirePropertyName: wirePropertyName,
		});
		const nestedSchema = _resolveOpenApiSchema({ schema: propertySchema, schemas: params.schemas });
		let nestedDtoClass = params.dtoClass;

		if (nestedSchema.properties) {
			const reflectedNestedDtoClass: unknown = Reflect.getMetadata(
				"design:type",
				params.dtoClass.prototype,
				internalPropertyName,
			);
			if (typeof reflectedNestedDtoClass !== "function") {
				throw new Error(`${[...wirePath, wirePropertyName].join(".")} has no nested DTO type metadata`);
			}

			nestedDtoClass = reflectedNestedDtoClass as DtoClass;
		}

		return _collectDocumentedUpdateLeaves({
			dtoClass: nestedDtoClass,
			schema: propertySchema,
			schemas: params.schemas,
			internalPath: [...internalPath, internalPropertyName],
			wirePath: [...wirePath, wirePropertyName],
		});
	});
}

async function _generateOpenApiDocument(): Promise<OpenAPIObject> {
	const moduleRef = await Test.createTestingModule({}).compile();
	const app = moduleRef.createNestApplication(new FastifyAdapter());

	try {
		return SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
			extraModels: [UpdateJobRequestDto, MissingNestedValidationRootDto],
		});
	} finally {
		await app.close();
	}
}

const openApiDocument = await _generateOpenApiDocument();
const updateJobSchema = _getDtoSchema({ document: openApiDocument, dtoClass: UpdateJobRequestDto });
const missingValidationSchema = _getDtoSchema({
	document: openApiDocument,
	dtoClass: MissingNestedValidationRootDto,
});
const documentedUpdateLeaves = _collectDocumentedUpdateLeaves({
	dtoClass: UpdateJobRequestDto,
	schema: updateJobSchema.schema,
	schemas: updateJobSchema.schemas,
});

describe("Updating every field in UpdateJobRequestDto", () => {
	let service: JobService;
	let jobRepository: {
		findById: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
	};
	let aiService: { generateObject: ReturnType<typeof vi.fn> };
	let mapService: { fuzzLocationCoordinate: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		jobRepository = {
			findById: vi.fn(),
			update: vi.fn().mockResolvedValue(undefined),
		};
		aiService = { generateObject: vi.fn() };
		mapService = {
			fuzzLocationCoordinate: vi.fn((params: { latitude: number; longitude: number }) => ({
				latitude: params.latitude,
				longitude: params.longitude,
			})),
		};

		const module = await Test.createTestingModule({
			providers: [
				JobService,
				{ provide: JobRepository, useValue: jobRepository },
				{ provide: AiService, useValue: aiService },
				{ provide: DeriveJobDataPublisher, useValue: { publish: vi.fn() } },
				{ provide: MapService, useValue: mapService },
			],
		}).compile();

		service = module.get(JobService);
	});

	it("should require every documented update field at every nesting level to have validation", () => {
		const contractErrors = _collectDtoContractErrors({
			dtoClass: UpdateJobRequestDto,
			schema: updateJobSchema.schema,
			schemas: updateJobSchema.schemas,
		});

		expect(contractErrors).toEqual([]);
	});

	it("should identify the complete path of a documented nested field without validation", () => {
		const contractErrors = _collectDtoContractErrors({
			dtoClass: MissingNestedValidationRootDto,
			schema: missingValidationSchema.schema,
			schemas: missingValidationSchema.schemas,
		});

		expect(contractErrors).toEqual(["nested.ignored_field is documented but has no validation metadata"]);
	});

	it("should reject an update when a DTO field is omitted from the repository command", () => {
		const updatedDto = plainToInstance(UpdateJobRequestDto, {
			description: "Preciso de ajuda para descarregar um caminhão.",
		});

		expect(_areAllSubmittedValuesPersisted({ submittedValue: updatedDto.description, updateCall: { data: {} } })).toBe(
			false,
		);
	});

	it("should identify when a target field value cannot be distinguished from a sibling value", () => {
		const updatedDto = { location: { congome: "BR", country: "BR" } };

		expect(
			_isTargetValueDistinctFromOtherSubmittedValues({
				updatedDto: updatedDto,
				targetPropertyPath: ["location", "congome"],
			}),
		).toBe(false);
	});

	it("should reject an ignored nested value that is unique in the request", () => {
		const updateCall = { data: { country: "BR" } };

		expect(_areAllSubmittedValuesPersisted({ submittedValue: "not-persisted", updateCall: updateCall })).toBe(false);
	});

	it.each(
		documentedUpdateLeaves.map((leaf) => [leaf.fieldPath, leaf] as const),
	)("should allow the documented update field %s to reach persistence", async (_fieldPath, leaf) => {
		const [topLevelFieldName, ...requiredNestedWirePath] = leaf.wirePath;
		if (topLevelFieldName === undefined) throw new Error("Documented update leaf has no top-level field name.");

		const topLevelFieldSchema = updateJobSchema.schema.properties?.[topLevelFieldName];
		if (!topLevelFieldSchema) {
			throw new Error(`UpdateJobRequestDto field is missing from OpenAPI: ${topLevelFieldName}`);
		}

		const updateDtoArbitrary = _buildOpenApiSchemaArbitrary({
			schema: topLevelFieldSchema,
			schemas: updateJobSchema.schemas,
			requiredWirePath: requiredNestedWirePath,
		}).map((fieldValue) =>
			plainToInstance(UpdateJobRequestDto, { [topLevelFieldName]: fieldValue }, { excludeExtraneousValues: true }),
		);

		const updateFieldProperty = fc.asyncProperty(updateDtoArbitrary, async (updatedDto) => {
			fc.pre(
				validateSync(updatedDto, {
					stopAtFirstError: true,
				}).length === 0,
			);
			fc.pre(
				_isTargetValueDistinctFromOtherSubmittedValues({
					updatedDto: updatedDto,
					targetPropertyPath: leaf.internalPath,
				}),
			);
			jobRepository.findById.mockReset().mockResolvedValue(existingJob);
			jobRepository.update.mockClear();
			aiService.generateObject.mockReset().mockResolvedValue({
				title: "Título derivado",
				description_summary: "Resumo derivado.",
			});

			await service.updateJob({ jobId: existingJob.id, updatedDto: updatedDto, locale: "pt-BR" });

			return _areAllSubmittedValuesPersisted({
				submittedValue: _getValueAtPropertyPath({
					value: updatedDto,
					propertyPath: leaf.internalPath,
				}),
				updateCall: jobRepository.update.mock.lastCall?.[0],
			});
		});

		await expect(
			fc.assert(updateFieldProperty, {
				numRuns: 50,
				maxSkipsPerRun: 100,
				interruptAfterTimeLimit: 2_000,
				markInterruptAsFailure: true,
			}),
		).resolves.toBeUndefined();
	});
});
