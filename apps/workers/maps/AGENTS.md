# AGENTS.md — Cataquí Maps

These instructions apply to the Maps microservice and supplement the application and Worker instructions above it.

## Mission and Ownership

Maps is Cataquí's microservice for maps and geographic capabilities. It owns place search, place details, static-map generation, stored-map delivery, and the provider integrations needed to support them.

- Add future map-related capabilities here. The current features do not limit the service's scope: new geographic lookup, rendering, or map-data capabilities belong to Maps when the product needs them.
- Keep map-provider calls, provider configuration, result normalization, map assets, and map-specific caching and generation coordination within this service. Other applications consume its owned contracts rather than integrating those providers themselves.
- Organize capabilities as focused features within Maps. Do not create another microservice solely because a new map capability differs from place search or static images.
- Implement capabilities for current requirements; broad domain ownership does not justify speculative endpoints, abstractions, or provider integrations.

## Product Boundary

Maps supplies geographic capabilities; the consuming application owns the product decisions that use them. The API owns job creation, feed behavior, location-privacy policy and fuzzy-location selection, publication rules, and persisted image references on jobs. Keep job-specific business rules and database access out of Maps.
