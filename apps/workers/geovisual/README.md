# Geovisual

Cloudflare Worker that generates map images for locations. No storage, authentication, overlays, styling customization, or job integration.

## Local use

Add `GEOAPIFY_API_KEY` to the ignored repository-root `.env`, then run from the repository root:

```sh
pnpm --filter @cataqui/geovisual-worker cf:dev
```

Open [interactive API documentation](http://localhost:8787/docs) or [the generated OpenAPI document](http://localhost:8787/openapi.json). Both routes are enabled when the Wrangler `ENVIRONMENT` binding is `development`, as configured at the root. They return `404` for staging, production, or an unspecified environment. Future Wrangler environments must declare their own `ENVIRONMENT` value; `vars` are not inherited. The OpenAPI request contract comes from the same Zod schemas used for validation.
