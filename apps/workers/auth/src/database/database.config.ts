import { instancePerContainerCachingFactory, registry } from "tsyringe";
import { AuthEnvironment } from "../environment.config";

export const DatabaseConfig = Symbol("DatabaseConfig");

export interface DatabaseConfig {
	connectionString: string;
}

@registry([
	{
		token: DatabaseConfig,
		useFactory: instancePerContainerCachingFactory<DatabaseConfig>((container) => ({
			connectionString: container.resolve<AuthEnvironment>(AuthEnvironment).DB.connectionString,
		})),
	},
])
export class DatabaseConfigRegistry {}
