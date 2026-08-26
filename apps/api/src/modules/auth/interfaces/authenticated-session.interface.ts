export interface IAuthenticatedSession {
	expiresAt: Date;
	sessionId: string;
	userId: string;
}
