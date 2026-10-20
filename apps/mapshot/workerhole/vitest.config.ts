import { defineConfig } from "vitest/config";
import { WorkspaceCoverage } from "../../../vitest.shared.ts";
export default defineConfig({ test: { globals: true, coverage: { ...WorkspaceCoverage, include: ["src/**/*.ts"] } } });
