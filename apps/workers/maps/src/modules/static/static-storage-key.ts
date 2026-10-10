export function getStaticStorageKey(params: { id: string }): string {
	return `static/${params.id}.webp`;
}
