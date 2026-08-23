# AGENTS.md — Geosearch Worker

## Worker Purpose

This Hono Worker is Cataquí's authenticated, provider-neutral geographic search microservice. Its intent is to be a bridge for the frontend between the provider and the app to get information about addresses such as address search, address details, etc.

It must be scoped to its purpose and not contain unrelated work that is not tied to geographic search or management of geographic data. 
