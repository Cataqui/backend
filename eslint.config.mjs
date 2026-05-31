import eslint from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
	{
		ignores: ["eslint.config.mjs", "commitlint.config.mjs", "prisma.config.ts", "vitest.config.ts", "generated/", "dist/", "worker/"],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	eslintPluginPrettierRecommended,
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
			sourceType: "module",
			parserOptions: {
				projectService: {
					allowDefaultProject: ["vitest.config.ts"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		rules: {
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-floating-promises": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"prettier/prettier": ["error", { endOfLine: "auto" }],
		},
	},
	{
		files: ["src/**/*.spec.ts"],
		languageOptions: {
			globals: {
				...globals.vitest,
			},
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
];
