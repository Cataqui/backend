function camelToSnake(str: string): string {
	return str
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.toLowerCase();
}

function truncateToLimitAfterWord(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;

	const truncated = text.substring(0, maxLength);
	const lastSpaceIndex = truncated.lastIndexOf(" ");

	if (lastSpaceIndex <= 0) return truncated;

	return truncated.substring(0, lastSpaceIndex).trimEnd();
}

export const StringUtils = {
	camelToSnake,
	truncateToLimitAfterWord,
} as const;
