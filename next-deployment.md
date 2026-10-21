# Auth and Profile v1 cutover record

Completed on 2026-10-21 by RyanHolanda with Codex. This is a historical receipt, not a procedure to repeat. Later releases follow the [deployment runbook](docs/deployment.md); manual Meta setup lives in the [infrastructure bootstrap runbook](docs/infrastructure-bootstrap.md#whatsapp-callback-after-the-first-auth-deployment).

## Verified deployments

| Environment | Verified revision | Workflow |
| --- | --- | --- |
| Staging | `0dce467b1e3addb3943ecf9a852e99b583b31823` | [Full delivery, attempt 2](https://github.com/Cataqui/backend/actions/runs/39632693271) |
| Production | `922b7dda77cac2fbb61dc57965f41dc9528854fe` | [First v1 delivery, attempt 2](https://github.com/Cataqui/backend/actions/runs/39621199290) |

Both workflows passed infrastructure reconciliation, API and Auth migration gates, Mapshot deployment and render verification, and Auth, Maps and API deployment/health checks. Production's first Mapshot candidate was retained after an unsuccessful deployment check; retrying the original job succeeded without repeating the dataset copy.

## One-time cutover completed

- The maintainer-approved API schema reset ran once in each environment and installed the fresh Profile v1 baseline. Auth uses its separate database and restricted roles, dedicated Redis and cache-disabled Hyperdrive. Auth was not reset. No development-data migration or old-client compatibility was retained.
- Fresh staging Mapshot resources were created, and GitHub runners downloaded and verified the complete 129.47 GiB `20261020.pmtiles` archive and prepared its worldwide landmark/index artifacts. Fresh production resources received all 52 staged objects, totaling 130.14 GiB. Live native renders and signed public map delivery passed in both environments.
- Both Meta applications now use their environment's Auth callback and verification token, with `messages` subscribed at v26.0. Meta test delivery reached each Auth Worker and returned HTTP 200. The selected Meta app secret was transferred into Auth before retiring its old copy.
- Both retired Webhooks Workers, custom domains and deployment tokens are absent. Authoritative DNS returns NXDOMAIN for both old Webhooks hostnames. Both obsolete API auth secret bindings/copies, old Webhooks secret folders, obsolete API account-ID secret bindings, and Maps-owned Geoapify copies are absent. Current Auth and Maps credentials were retained; no shared external Geoapify account credential was revoked.
- The canonical shared-zone policy includes both Auth hosts and no old Webhooks host exceptions. The protected OpenTofu state bucket was retained. Both environments had already forgotten the six obsolete secret/folder addresses before the completed migration markers were removed.

## Live verification

Full smoke checks passed before and after retirement in both environments: synthetic signed WhatsApp login, account/session reads, protected feed access, profile creation/retry/conflict, contacts, profile-required job rejection, job creation/read/archive, real Google Places search, signed public 480×1280 map GET/HEAD/ETag/304, refresh, logout and expired-refresh replay revocation. Temporary verification records were removed after their sessions were revoked.

## Launch requirements

Both Meta apps were unpublished when this cutover was verified. Meta test webhooks and synthetic signed login prove backend integration, but real incoming WhatsApp messages require app publication. Publication remains a separate launch action. The mobile client must also deliver the current Auth and Profile onboarding contract before launch; endpoint details remain in Auth OpenAPI and API Swagger.

The one-time API resets discarded the development schema and data. Restoring an older Worker version cannot reverse that cutover. Future rollback choices must remain compatible with the installed database schemas.
