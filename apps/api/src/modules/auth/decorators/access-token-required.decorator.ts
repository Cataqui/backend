import { applyDecorators, type CanActivate, type Type, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { AccessTokenGuard } from "../guards/access-token.guard";

export function AccessTokenRequired(...guardsAfterAccessToken: Type<CanActivate>[]): MethodDecorator & ClassDecorator {
	return applyDecorators(UseGuards(AccessTokenGuard, ...guardsAfterAccessToken), ApiBearerAuth());
}
