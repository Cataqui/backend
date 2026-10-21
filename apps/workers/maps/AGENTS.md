# AGENTS.md — Cataquí Maps

These instructions apply to the Maps microservice and supplement the application and Worker instructions above it.

## Mission and Ownership

Maps owns geographic lookup, place provider integrations, signed static-map location references, public image delivery, and disposable image caching.

- Keep place search, place details, authenticated ingress, signed location references, image URL contracts, and image delivery here. Auth owns accounts, credentials and sessions; Maps resolves its opaque bearer token through the private `AUTH` Service Binding and uses the returned account ID for its own usage limits.
- Treat Mapshot as an external static-image provider. Forward the requested logical viewport; keep raster density, label scaling and encoding policy inside Mapshot. `StaticRepository` owns its private integration and returns Maps-owned image data; services and delivery cache metadata must not depend on Mapshot contracts or provenance.
- Mapshot independently owns source storage, import, preparation, selection, activation, rendering, visual reference selection and placement, assets, encoding, and Container lifecycle. Maps calls its ordinary private rendering entrypoint through a Service Binding, supplying only a location and rendering specification.
- Never add direct source storage access, reverse source callbacks, Mapshot administration, or renderer Container bindings to Maps. Never import another application's implementation.
- Cached image identity is a Maps delivery policy. Keep renderer provenance independent so source or renderer releases do not invalidate existing cached images or require a renderer call for a cached conditional response.
- Implement capabilities for current requirements; broad domain ownership does not justify speculative endpoints, abstractions, or provider integrations.

## Product Boundary

Maps supplies geographic capabilities; the consuming application owns the product decisions that use them. The API owns job creation, feed behavior, location-privacy policy and fuzzy-location selection, publication rules, and persisted image references on jobs. Keep job-specific business rules and database access out of Maps.
