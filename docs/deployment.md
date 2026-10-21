# Backend deployment runbook

## Purpose

Use this runbook to deploy, verify, and recover staging and production releases from `Cataqui/backend`.

## Prerequisites

- [Infrastructure bootstrap](infrastructure-bootstrap.md), including manually supplied application keys, has completed successfully.
- The selected GitHub environment has its required reviewers and branch policy, `INFISICAL_OPENTOFU_IDENTITY_ID`, `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`, and `GOOGLE_OPENTOFU_SERVICE_ACCOUNT`.
- CI is green for the candidate revision. Main's protection rule requires a successful staging deployment of the release PR's head.
- Check provider status pages for an incident affecting the intended deployment.

## Normal deployment

Merge application changes into `staging` and wait for its CI, deployment, health checks, and Mapshot render probe to succeed. Verify the affected user flow before promotion.

Open a release PR from `staging` to `main` and merge it with a **merge commit**. This preserves staging ancestry and keeps subsequent release diffs limited to new changes. Wait for production CI and deployment to finish, then verify the affected user flow there.

To explicitly deploy every application from the current staging head:

```sh
gh workflow run deploy.yml --ref staging -f scope=all
```

Use `--ref main` for production. Select `scope=infrastructure` for infrastructure reconciliation without application deployment. Documentation-only changes must not deploy runtime applications.

## Interrupted or failed deployment

Resolve the reported failure before continuing promotion. Retry the original run so an interrupted Mapshot preparation retains its pinned revision and saved progress:

```sh
gh run rerun RUN_ID --failed
```

To rerun one failed job and its dependent jobs, use `gh run rerun RUN_ID --job JOB_ID`. A new revision cannot resume preparation reserved by another revision. Keep the original run URL and commit until its preparation or recovery finishes.

### State lock left by a cancelled infrastructure job

Identify the failing environment and OpenTofu root. Inspect only its lock metadata, and confirm that the recorded holder's GitHub job and any matching local process have stopped. GitHub queue status can lag behind the runner's actual start; check the job's execution timestamps before cancelling it.

With that root initialized against the matching environment backend and its state credentials loaded securely, release the recorded lock from the root directory:

```sh
tofu force-unlock LOCK_ID
```

Use the exact lock ID after verifying its owner has stopped. Then rerun the failed infrastructure job and require a successful plan and apply before application delivery. Keep state locking enabled. See [OpenTofu's command reference](https://opentofu.org/docs/cli/commands/force-unlock/).

## Rollback and escalation

Check the failed workflow's restoration and health-check results. A first deployment has no previous successful version to restore; correct and retry its candidate. Restoring a Worker version does not reverse database migrations or recover deleted data, so confirm schema compatibility before selecting an older application version.

Escalate unresolved ownership, credential, database-compatibility, or restoration failures to the backend maintainers with the environment, commit, run URL, failing phase, and sanitized diagnostics. Keep credentials, connection URLs, state files and saved plans private.
