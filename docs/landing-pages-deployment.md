# Landing Pages deployment

The backend owns the Cloudflare Pages projects, build settings, domains, DNS, and canonical-domain redirect through OpenTofu. Cloudflare's GitHub integration builds `Cataqui/landing`; that repository needs no deployment credential or Infisical integration.

| Landing branch | Pages project | Public domain |
| --- | --- | --- |
| `staging` | `cataqui-landing-staging` | `staging.cataqui.com` |
| `main` | `cataqui-landing-production` | `cataqui.com` |

`www.cataqui.com` redirects permanently to `cataqui.com`, preserving paths and query strings. Certificate validation paths under `/.well-known/` remain unredirected. Other branch builds are disabled. Cloudflare may still list skipped preview events for pushes to the other branch.

## Deploy the website

Push landing changes to `staging`, verify the staging website and matching deployment commit, then promote the verified source to `main`. Each push automatically starts that environment's Pages build. A failed build leaves the previous successful site serving traffic.

Confirm the intended deployment succeeded, its commit matches the pushed branch, assets load, client interactions work, and unknown routes return the site's 404 page. Check the custom domain as well as the project's `pages.dev` URL.

## Change infrastructure

Follow the existing [infrastructure prerequisites](infrastructure-bootstrap.md). The Cloudflare Workers & Pages GitHub app must retain access to `Cataqui/landing` in the configured Cloudflare account.

Change backend infrastructure code and use the backend Deploy workflow with scope **infrastructure** on the matching branch (`staging` or `main`). Production owns the global zone DNS root, including staging DNS. The Pages projects have independent staging and production R2 states.

The **Plan landing Pages infrastructure** workflow plans without applying. Select `staging` on backend `staging` or `production` on backend `main`. Plans and credentials remain private to the job. Infrastructure credentials remain in the backend's environment-scoped Infisical paths; no landing secrets are required.

The build runs `pnpm run validate` and publishes `dist`. OpenTofu sets Node `24.19.0` and pnpm `11.17.0`. Keep the landing's pinned GitHub Mateo dependency and exact build allowance aligned when updating it. Local linking is commented out.

## Recovery

For a website regression, revert the landing change on the affected branch and push the revert to trigger another build. Verify the new deployment commit and website. Infrastructure failures require inspecting a fresh plan and remote state before retrying; do not manually duplicate managed projects or DNS records.

## Validation

The GitHub dependency switch passed landing lint, Astro checks, and build. Three cold local mobile runs per build used a 390 × 844 viewport, 4× CPU throttling, 150 ms latency, and approximately 1.6 Mbps throughput. Median LCP was 5.188 s before and after; FCP was 468 ms before and after; CLS was zero. Transfer sizes and screenshots matched. These local comparisons do not certify hosted performance or target-device behavior.
