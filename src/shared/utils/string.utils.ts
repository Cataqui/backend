function camelToSnake(str: string): string {
	return str
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.toLowerCase();
}

export const StringUtils = {
	camelToSnake,
} as const;
