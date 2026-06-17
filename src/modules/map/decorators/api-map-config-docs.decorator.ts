import { applyDecorators, HttpStatus } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { MapConfigOutputDto } from "../dto/map-config-output.dto";

export function ApiMapConfigDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({ summary: "Get map configuration and auth tile credentials for a region" }),
		ApiQuery({
			name: "region",
			required: true,
			description: "Region code (ISO 3166-1 alpha-2 country code)",
			example: "BR",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description:
				"Map configuration returned successfully. Response is cacheable for the duration of the credentials validity.",
			type: MapConfigOutputDto,
			headers: {
				"Cache-Control": {
					description: "Public cache directive with max-age matching credential expiry",
					schema: { type: "string", example: "public, max-age=3600" },
				},
			},
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid region format or missing query parameter",
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No map available for the requested region",
		}),
	);
}
