import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Public } from "../authentication/decorators/public.decorator";
import type { IAuthenticatedRequest } from "../authentication/interfaces/authenticated-request.interface";
import { ProfileRequired } from "./decorators/profile-required.decorator";
import { ProfileService } from "./profile.service";

@Injectable()
export class ProfileGuard implements CanActivate {
	constructor(
		private readonly _reflector: Reflector,
		private readonly _profileService: ProfileService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const targets = [context.getHandler(), context.getClass()];
		const isPublic = this._reflector.getAllAndOverride(Public, targets);
		if (isPublic) return true;
		const requiresProfile = this._reflector.getAllAndOverride(ProfileRequired, targets);
		if (!requiresProfile) return true;
		const request = context.switchToHttp().getRequest<IAuthenticatedRequest>();
		await this._profileService.requireExists({ profileId: request.authSession.accountId });
		return true;
	}
}
