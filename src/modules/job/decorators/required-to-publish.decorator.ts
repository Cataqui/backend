import "reflect-metadata";

const REQUIRED_TO_PUBLISH_METADATA_KEY = Symbol("required_to_publish");

interface IRequiredToPublishFieldMetadata<PROPERTY_NAME extends PropertyKey = PropertyKey> {
	readonly propertyName: PROPERTY_NAME;
	readonly publicFieldName: string;
}

export function RequiredToPublish(params?: { publicFieldName?: string }): PropertyDecorator {
	return (target: object, propertyName: string | symbol): void => {
		const existingFields = (Reflect.getOwnMetadata(REQUIRED_TO_PUBLISH_METADATA_KEY, target.constructor) ??
			[]) as IRequiredToPublishFieldMetadata[];

		Reflect.defineMetadata(
			REQUIRED_TO_PUBLISH_METADATA_KEY,
			[
				...existingFields,
				{
					propertyName: propertyName,
					publicFieldName: params?.publicFieldName ?? String(propertyName),
				},
			],
			target.constructor,
		);
	};
}

function getFields<DTO extends object>(params: {
	dtoClass: abstract new (...args: never[]) => DTO;
}): readonly IRequiredToPublishFieldMetadata<keyof DTO>[] {
	return (Reflect.getOwnMetadata(REQUIRED_TO_PUBLISH_METADATA_KEY, params.dtoClass) ??
		[]) as readonly IRequiredToPublishFieldMetadata<keyof DTO>[];
}

export const RequiredToPublishMetadata = {
	getFields,
} as const;
