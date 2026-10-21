# Backend deployment runbook

## Purpose

Use this runbook to deploy, verify, and recover staging and production releases from `Cataqui/backend`.

## Prerequisites

- [Infrastructure bootstrap](infrastructure-bootstrap.md), including manually supplied application keys, has completed successfully.
- The selected GitHub environment has its required reviewers and branch policy, `INFISICAL_OPENTOFU_IDENTITY_ID`, `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`, and `GOOGLE_OPENTOFU_SERVICE_ACCOUNT`.
- CI is green for the exact commit. Production deploys from `main`; a prior staging deployment of the application code is not required.
- Cloudflare, Neon, Infisical, Google Cloud, and GitHub status pages show no incident affecting deployment.

## Normal deployment

Push to `staging` for staging or merge the intended commit to `main` for production. Wait for CI and the deployment workflow to succeed.
