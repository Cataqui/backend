export function getWorkerVersion(params: { metadata: { id: string; tag: string } }): string {
	return params.metadata.tag || params.metadata.id;
}
