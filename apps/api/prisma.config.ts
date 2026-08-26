import path from "node:path";
import { config as loadEnvironment } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnvironment({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
	schema: path.join(import.meta.dirname, "prisma", "schema"),
	datasource: {
		url: process.env.DATABASE_OWNER_DIRECT_URL!,
	},
});
