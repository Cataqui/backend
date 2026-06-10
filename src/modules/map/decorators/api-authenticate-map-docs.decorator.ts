import { HttpStatus, applyDecorators } from "@nestjs/common";
import { ApiOperation, ApiBody, ApiResponse } from "@nestjs/swagger";
import { MapAuthenticateRequestDto } from "../dto/map-authenticate-request.dto";
import { MapAuthOutputDto } from "../dto/map-auth-output.dto";

export function ApiAuthenticateMapDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		ApiOperation({ summary: "Generate authenticated map tile credentials for a region" }),
		ApiBody({ type: MapAuthenticateRequestDto }),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Map credentials generated successfully",
			type: MapAuthOutputDto,
		}),
		ApiResponse({
			status: HttpStatus.BAD_REQUEST,
			description: "Invalid region format or missing field",
		}),
		ApiResponse({
			status: HttpStatus.NOT_FOUND,
			description: "No map available for the requested region",
		}),
	);
}
