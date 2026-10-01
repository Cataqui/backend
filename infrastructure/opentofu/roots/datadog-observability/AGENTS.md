# AGENTS.md — Datadog Observability

These instructions supplement the repository root and `infrastructure/AGENTS.md` instructions for this OpenTofu root.

## Purpose

This root owns everything the team looks at in Datadog for one environment: monitors, the external health check, and the API dashboard. Nothing here may be created or edited in the Datadog UI. A change is made in this root, reviewed, and applied by the deployment workflow; manual UI edits are overwritten on the next deploy.

## Adding or changing a monitor

- Add a `datadog_monitor` beside the existing ones. Scope every query with `local.metric_scope` (metric queries) or `local.scope` (log queries) so staging and production never mix.
- Give it `local.tags` so the dashboard's monitor list and ownership filters pick it up, and end the message with `local.notify`.
- Write the message for someone with zero context: what is wrong, why it matters to users, and where to look first.
- Set both a `critical` and, where it helps, a `warning` threshold. The threshold in `monitor_thresholds` must equal the number in the query.
- Prefer APM trace metrics (`trace.http.server.request.*`) and runtime metrics over span searches; this Datadog organization rejects trace-analytics monitor queries.

## Adding or changing a dashboard widget

- Edit the JSON template, not the dashboard in Datadog. Use the template variables for every scope; never hardcode an environment.
- Keep the dashboard small: each widget must answer a question someone asks during an incident.

## Verifying queries against real data

Tests here run against a mocked provider and cannot prove a query returns data. Before relying on a new metric, facet, or log attribute, check it against the live organization with the Datadog CLI using read-only commands, for example:

```sh
pup metrics list --read-only --filter 'trace.http.server.*' --tag-filter service:cataqui-api
pup api -X POST v1/monitor/validate --input monitor.json
```

The validate endpoint accepts a monitor definition (`type`, `query`, `name`, `message`, and `options.thresholds`) and reports syntax errors without creating anything. A query that validates can still match nothing if the metric or attribute name is wrong, so confirm the metric exists once the API has sent data.

## Notifications

Monitor recipients come from `local.notification_handles`. Add a Datadog handle there (for example a Slack channel handle once the Slack integration is managed in OpenTofu) instead of editing individual messages.

## Credentials

This root authenticates with its own `DD_API_KEY` and `DD_APP_KEY`, which the Datadog key root issues on the OpenTofu service account and stores in this root's generated OpenTofu folder in Infisical. When a resource type needs a new Datadog permission, add the scope to this root's entry in the key root's scope list and deploy; the bootstrap does not need to run again.
