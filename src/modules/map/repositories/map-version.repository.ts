import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";

@Injectable()
export class MapVersionRepository {
	constructor(private readonly _prisma: PrismaService) {}

	async findByRegionCode(params: {
		regionCode: string;
	}): Promise<{ id: string; regionCode: string; mapFileName: string; fontstack: string } | null> {
		const record = await this._prisma.mapVersion.findUnique({
			where: { regionCode: params.regionCode },
			select: { id: true, regionCode: true, mapFileName: true, fontstack: true },
		});

		return record;
	}
}
