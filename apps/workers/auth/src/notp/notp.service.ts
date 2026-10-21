import { NotpAccountPersistenceFailedError } from "./errors/notp-account-persistence-failed.error";
import { NotpIntentCreationCollisionError } from "./errors/notp-intent-creation-collision.error";
import { NotpIntentNotFoundError } from "./errors/notp-intent-not-found.error";
import { NotpProcessingInProgressError } from "./errors/notp-processing-in-progress.error";
import { NotpProcessingOwnershipLostError } from "./errors/notp-processing-ownership-lost.error";
import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { inject, injectable } from "tsyringe";
import type { z } from "zod";
import { AccountRepository } from "../account/account.repository";
import { SessionService } from "../session/session.service";
import type { NotpChannel } from "./notp-channel.enum";
import type { NotpIntentExchangeOutputSchema } from "./notp-intent-exchange-output.schema";
import type { NotpIntentOutputSchema } from "./notp-intent-output.schema";
import { NotpIntentStatus } from "./notp-intent-status.enum";
import { NotpRepository } from "./notp.repository";
import { NotpConfig } from "./notp.config";

type NotpIntent =
	| { candidateSessionId: string; status: NotpIntentStatus.PENDING | NotpIntentStatus.PROCESSING }
	| { candidateSessionId: string; status: NotpIntentStatus.VERIFIED; accountId: string; identityId: string };

enum NotpWaitResult {
	ABORTED = "ABORTED",
	DEADLINE = "DEADLINE",
	TIMED_OUT = "TIMED_OUT",
	UNAVAILABLE = "UNAVAILABLE",
	VERIFIED = "VERIFIED",
	READ_DUE = "READ_DUE",
}

@injectable()
export class NotpService {
	constructor(
		private readonly _repository: NotpRepository,
		private readonly _accountRepository: AccountRepository,
		private readonly _sessionService: SessionService,
		@inject(NotpConfig) private readonly _config: NotpConfig,
	) {}

	async createIntent(params: { channel: NotpChannel }): Promise<z.infer<typeof NotpIntentOutputSchema>> {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const candidateSessionId = randomUUID();
			const intentToken = Buffer.from(randomBytes(32)).toString("base64url");
			const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
			let codeSuffix = "";
			for (let index = 0; index < 10; index += 1) codeSuffix += alphabet.charAt(randomInt(alphabet.length));
			const code = `NOTP-${codeSuffix}`;
			const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
			const created = await this._repository.createIntent({
				notpCodeHash: createHash("sha256").update(code).digest("hex"),
				candidateSessionId: candidateSessionId,
				intentTokenHash: createHash("sha256").update(intentToken).digest("hex"),
				channel: params.channel,
				expiresInSeconds: 15 * 60,
			});
			if (created !== 1) continue;
			return {
				intentToken: intentToken,
				code: code,
				codeReceiver: this._config.whatsappPhoneNumber,
				expiresAt: expiresAt.toISOString(),
			};
		}
		throw new NotpIntentCreationCollisionError();
	}

	async exchangeIntentForSession(params: {
		intentToken: string;
		abortSignal?: AbortSignal;
	}): Promise<z.infer<typeof NotpIntentExchangeOutputSchema>> {
		const intentTokenHash = createHash("sha256").update(params.intentToken).digest("hex");
		let intent = await this._findIntent({ intentTokenHash: intentTokenHash });
		if (intent === null) {
			throw new NotpIntentNotFoundError();
		}

		if (intent.status !== NotpIntentStatus.VERIFIED && params.abortSignal?.aborted !== true) {
			const leaseOwner = randomUUID();
			let deadlineTimer!: ReturnType<typeof setTimeout>;
			const deadline = new Promise<NotpWaitResult.DEADLINE>((resolve) => {
				deadlineTimer = setTimeout(() => resolve(NotpWaitResult.DEADLINE), 22_000);
			});
			let abortWait!: () => void;
			const aborted = new Promise<NotpWaitResult.ABORTED>((resolve) => {
				abortWait = (): void => resolve(NotpWaitResult.ABORTED);
			});
			params.abortSignal?.addEventListener("abort", abortWait, { once: true });
			if (params.abortSignal?.aborted) abortWait();
			let subscription: ReturnType<NotpRepository["subscribeToVerification"]>["subscription"] | undefined;
			let acquiredLease = false;
			try {
				let leaseResult: string | null;
				try {
					leaseResult = await Promise.race([
						this._repository.acquireVerificationWaitLease({
							intentTokenHash: intentTokenHash,
							ownerToken: leaseOwner,
							expiresInMilliseconds: 25_000,
						}),
						deadline,
						aborted,
					]);
				} catch {
					leaseResult = NotpWaitResult.UNAVAILABLE;
				}
				acquiredLease = leaseResult === "OK";
				const exchangeStillConnected = !params.abortSignal?.aborted;
				if (acquiredLease && exchangeStillConnected) {
					let readyTimer!: ReturnType<typeof setTimeout>;
					let waitTimer!: ReturnType<typeof setTimeout>;
					try {
						const connection = this._repository.subscribeToVerification({ intentTokenHash: intentTokenHash });
						subscription = connection.subscription;
						let settleReady!: (ready: boolean) => void;
						const ready = new Promise<boolean>((resolve) => {
							settleReady = resolve;
							readyTimer = setTimeout(() => resolve(false), 1_500);
						});
						let settleNotification!: (result: NotpWaitResult) => void;
						const notification = new Promise<NotpWaitResult>((resolve) => {
							settleNotification = resolve;
						});
						const timedOut = new Promise<NotpWaitResult.TIMED_OUT>((resolve) => {
							waitTimer = setTimeout(() => resolve(NotpWaitResult.TIMED_OUT), 20_000);
						});
						subscription.on("subscribe", () => settleReady(true));
						subscription.on("message", ({ channel, message }) => {
							if (channel === connection.channel && message === NotpIntentStatus.VERIFIED) {
								settleNotification(NotpWaitResult.VERIFIED);
							}
						});
						subscription.on("error", () => {
							settleReady(false);
							settleNotification(NotpWaitResult.UNAVAILABLE);
						});
						const readiness = await Promise.race([ready, aborted, deadline]);
						if (readiness !== NotpWaitResult.ABORTED && readiness !== NotpWaitResult.DEADLINE) {
							const reread = await Promise.race([
								this._findIntent({ intentTokenHash: intentTokenHash }),
								aborted,
								deadline,
							]);
							if (typeof reread !== "string") intent = reread;
							let notificationConsumed = false;
							let readIndex = 0;
							const readIntervals = [400, 700, 1_000, 1_500, 2_000, 3_000] as const;
							while (readiness === true && intent !== null && intent.status !== NotpIntentStatus.VERIFIED) {
								let readTimer!: ReturnType<typeof setTimeout>;
								const readDue = new Promise<NotpWaitResult.READ_DUE>((resolve) => {
									readTimer = setTimeout(
										() => resolve(NotpWaitResult.READ_DUE),
										readIntervals[Math.min(readIndex, readIntervals.length - 1)],
									);
								});
								const result = await Promise.race(
									notificationConsumed
										? [readDue, aborted, deadline, timedOut]
										: [notification, readDue, aborted, deadline, timedOut],
								);
								clearTimeout(readTimer);
								if (result === NotpWaitResult.ABORTED || result === NotpWaitResult.DEADLINE) break;
								const updatedIntent = await Promise.race([
									this._findIntent({ intentTokenHash: intentTokenHash }),
									aborted,
									deadline,
								]);
								if (typeof updatedIntent === "string") break;
								intent = updatedIntent;
								if (result === NotpWaitResult.TIMED_OUT || result === NotpWaitResult.UNAVAILABLE) break;
								if (result === NotpWaitResult.VERIFIED) {
									notificationConsumed = true;
									readIndex = 0;
								} else {
									readIndex += 1;
								}
							}
						}
					} catch (error) {
						if (subscription !== undefined) throw error;
						const reread = await Promise.race([
							this._findIntent({ intentTokenHash: intentTokenHash }),
							aborted,
							deadline,
						]);
						if (typeof reread !== "string") intent = reread;
					} finally {
						clearTimeout(readyTimer);
						clearTimeout(waitTimer);
					}
				} else if (leaseResult !== NotpWaitResult.ABORTED && leaseResult !== NotpWaitResult.DEADLINE) {
					const reread = await Promise.race([
						this._findIntent({ intentTokenHash: intentTokenHash }),
						aborted,
						deadline,
					]);
					if (typeof reread !== "string") intent = reread;
				}
			} finally {
				params.abortSignal?.removeEventListener("abort", abortWait);
				if (subscription !== undefined) {
					subscription.removeAllListeners();
					try {
						await Promise.race([subscription.unsubscribe(), deadline]);
					} catch {
						console.warn("NOTP verification subscription cleanup failed");
					}
				}
				if (acquiredLease) {
					try {
						await Promise.race([
							this._repository.releaseVerificationWaitLease({
								intentTokenHash: intentTokenHash,
								ownerToken: leaseOwner,
							}),
							deadline,
						]);
					} catch {
						console.warn("NOTP verification lease cleanup failed");
					}
				}
				clearTimeout(deadlineTimer);
			}
		}

		if (intent === null) {
			throw new NotpIntentNotFoundError();
		}
		if (intent.status !== NotpIntentStatus.VERIFIED) {
			return { status: NotpIntentStatus.PENDING, retryAfterSeconds: 1 };
		}
		return this._sessionService.create({
			sessionId: intent.candidateSessionId,
			accountId: intent.accountId,
			identityId: intent.identityId,
		});
	}

	async verifyNotp(params: {
		channel: NotpChannel;
		providerMessageId: string;
		providerSubject: string;
		contactIdentifier: string;
		providerProfileName: string | undefined;
		notpCodeHash: string;
	}): Promise<void> {
		const verifiedAt = new Date();
		const claim = await this._repository.claimIntentForVerification({
			notpCodeHash: params.notpCodeHash,
			providerMessageId: params.providerMessageId,
			nowMilliseconds: verifiedAt.getTime(),
			channel: params.channel,
			processingLeaseMilliseconds: 60_000,
		});
		if (claim.length === 0) return;
		if (claim.length === 1) {
			throw new NotpProcessingInProgressError();
		}
		const [intentTokenHash, candidateSessionId] = claim;
		try {
			const identity = await this._accountRepository.saveVerifiedIdentity({
				providerSubject: params.providerSubject,
				displayIdentifier: params.providerProfileName?.trim() || params.contactIdentifier,
				identifier: params.contactIdentifier,
				lastVerifiedAt: verifiedAt,
			});
			if (identity === undefined) throw new NotpAccountPersistenceFailedError();
			const verified = await this._repository.markIntentVerified({
				candidateSessionId: candidateSessionId,
				notpCodeHash: params.notpCodeHash,
				intentTokenHash: intentTokenHash,
				providerMessageId: params.providerMessageId,
				channel: params.channel,
				accountId: identity.accountId,
				identityId: identity.identityId,
				expiresInSeconds: 5 * 60,
			});
			if (verified !== 1) {
				throw new NotpProcessingOwnershipLostError();
			}
		} catch (error) {
			try {
				await this._repository.releaseProcessingIntent({
					intentTokenHash: intentTokenHash,
					providerMessageId: params.providerMessageId,
				});
			} catch {
				console.warn("NOTP processing lease cleanup failed");
			}
			throw error;
		}
	}

	private async _findIntent(params: { intentTokenHash: string }): Promise<NotpIntent | null> {
		const stored = await this._repository.findIntentByTokenHash({ intentTokenHash: params.intentTokenHash });
		if (stored.length === 0) return null;
		if (stored[1] === NotpIntentStatus.VERIFIED) {
			return { candidateSessionId: stored[0], status: stored[1], accountId: stored[2], identityId: stored[3] };
		}
		return { candidateSessionId: stored[0], status: stored[1] };
	}
}
