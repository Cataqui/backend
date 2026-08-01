import { RequiredToPublish, RequiredToPublishMetadata } from "./required-to-publish.decorator";

describe("RequiredToPublish", () => {
	it("should describe a required field using its property name by default", () => {
		class PublicationDto {
			@RequiredToPublish()
			readonly title: string | null = null;
		}

		expect(RequiredToPublishMetadata.getFields({ dtoClass: PublicationDto })).toEqual([
			{ propertyName: "title", publicFieldName: "title" },
		]);
	});

	it("should describe a required field using its overridden public name", () => {
		class PublicationDto {
			@RequiredToPublish({ publicFieldName: "description_summary" })
			readonly descriptionSummary: string | null = null;
		}

		expect(RequiredToPublishMetadata.getFields({ dtoClass: PublicationDto })).toEqual([
			{ propertyName: "descriptionSummary", publicFieldName: "description_summary" },
		]);
	});

	it("should return no publication requirements for an undecorated DTO", () => {
		class PublicationDto {
			readonly title: string | null = null;
		}

		expect(RequiredToPublishMetadata.getFields({ dtoClass: PublicationDto })).toEqual([]);
	});
});
