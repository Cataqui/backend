import { PrismaPg } from "@prisma/adapter-pg";
import { inject, Lifecycle, scoped, type Disposable } from "tsyringe";
import { PrismaClient } from "../generated/prisma/client";

import { DatabaseConfig } from "./database.config";

@scoped(Lifecycle.ContainerScoped)
export class AuthDatabase implements Disposable {
	readonly client: PrismaClient;

	constructor(@inject(DatabaseConfig) config: DatabaseConfig) {
		this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.connectionString }) });
	}

	async dispose(): Promise<void> {
		await this.client.$disconnect();
	}
}
