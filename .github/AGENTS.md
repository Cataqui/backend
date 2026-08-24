# AGENTS.md — GitHub Automation

These instructions apply to GitHub Actions and repository-local actions.

## Automation

- Prefer official maintained actions and CLIs. Pin every external action to a full commit SHA and include its release tag as a comment.
- Keep jobs fail-closed with minimum permissions. Never print credentials, persist them in artifacts, or pass them in command arguments.
- Application deployment and infrastructure provisioning are separate responsibilities. Infrastructure changes must not silently trigger application deployment.

## Infisical

- Infisical remains the source of truth for application and future OpenTofu secrets.
- Fetch only an exact, non-recursive secret path. Validate the required names, mask values, place them only in the current job environment, and remove temporary files unconditionally.
- Do not add new OIDC identities, grants, GitHub variables, or authenticated OpenTofu jobs until that work is explicitly requested.
