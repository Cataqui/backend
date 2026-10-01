import { applyDecorators, HttpStatus, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { MicroservicesAuthJwksOutputSchema } from "@cataqui/microservices-auth-schemas/jwks";

export function ApiGetMicroservicesAuthJwksDocs(): MethodDecorator & ClassDecorator {
	return applyDecorators(
		SerializeOptions({ schema: MicroservicesAuthJwksOutputSchema }),
		ApiOperation({
			summary: "Get microservice access-token verification keys",
			description: "Returns the public keys used to verify Cataquí microservice access tokens.",
		}),
		ApiResponse({
			status: HttpStatus.OK,
			description: "Microservice access-token verification keys returned.",
			standardSchema: MicroservicesAuthJwksOutputSchema,
		}),
	);
}
