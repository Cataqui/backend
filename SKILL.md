---
name: cataqui-api-integration
description: "A complete guide for integrating the Cataquí Private User API in any programming language. Explains core principles, endpoints, payload formats, and pagination for interacting with the hyperlocal feed of quick jobs and tasks."
---

# Cataquí API Integration Guide

## Overview

This skill provides AI agents and developers with the context required to integrate the **Cataquí Private User API** from any client, in any programming language (e.g., JavaScript/TypeScript, Dart, Python, Swift, Kotlin, Go).

Cataquí is a hyperlocal feed for quick jobs, side hustles, informal work, and short-term tasks. The core product promise is:

> Open Cataquí and immediately see real opportunities happening near you.

## Core API Principles

When implementing a client wrapper for this API, adhere to the following principles:

1. **Base Path:** All user-facing API endpoints are versioned and start with `/v1`. (e.g., `https://api.example.com/v1/feed`).
2. **Wire Format (Snake Case):** The external API payloads **must** use `snake_case`. Even if your client's programming language idiomatic style is `camelCase` (e.g., in Dart, JS, Go), you must serialize requests to `snake_case` before sending, and deserialize responses from `snake_case` back into your models.
3. **Content Type:** Always send requests with `Content-Type: application/json` and expect JSON responses.
4. **Pagination:** Infinite feeds use **Cursor Pagination**, not offset (`page=x`) pagination.
5. **Standardized Errors:** Error responses contain stable error codes (e.g., `POST_NOT_FOUND`, `INVALID_CURSOR`) that you can safely handle or translate into user-friendly messages.

## Endpoints

### 1. Get the Feed (Discover Opportunities)

Fetches a paginated list of local opportunities.

- **Method & Path:** `GET /v1/feed`
- **Query Parameters:**
  - `cursor` (optional): The cursor string received from the previous page's response to fetch the next page.
  - `sort` (optional): Sorting order.
- **Expected Response Shape:**
  ```json
  {
  	"data": [
  		{
  			"id": "uuid",
  			"title": "Help unload truck",
  			"description": "Short description of the job...",
  			"created_at": "2023-10-01T12:00:00Z"
  		}
  	],
  	"meta": {
  		"next_cursor": "encoded_string_for_next_page"
  	}
  }
  ```

### 2. Get Job Details

Retrieves the full details of a specific post, including contact and payment information.

- **Method & Path:** `GET /v1/job/:job_id`
- **Path Parameters:**
  - `job_id`: The UUID of the job.
- **Expected Response Shape:**
  ```json
  {
  	"id": "uuid",
  	"title": "Help unload truck",
  	"description": "Need someone to help unload a delivery truck this Saturday morning...",
  	"type": "INDIVIDUAL",
  	"category_id": "uuid",
  	"location": {
  		"address": "123 Main St",
  		"city": "Sample City"
  	},
  	"contact": {
  		"whatsapp_number": "+1234567890"
  	},
  	"payment": {
  		"amount": 50.0,
  		"currency": "USD"
  	},
  	"created_at": "2023-10-01T12:00:00Z"
  }
  ```

### 3. Create a Job

Posts a new opportunity to the feed.

- **Method & Path:** `POST /v1/job/create`
- **Request Body Shape (Must be `snake_case`):**
  ```json
  {
  	"title": "Help unload truck",
  	"description": "Need someone to help unload a delivery truck this Saturday morning. Will take about 2 hours.",
  	"type": "INDIVIDUAL",
  	"category_id": "afdfd9b2-203d-4528-8a1c-82b6b139039b",
  	"location": {
  		"address": "123 Main St",
  		"city": "Sample City"
  	},
  	"contact": {
  		"whatsapp_number": "+1234567890"
  	},
  	"payment": {
  		"amount": 50.0,
  		"currency": "USD"
  	}
  }
  ```

## Language-Agnostic Implementation Guide

When building the integration (whether it's an SDK, a mobile app repository, or a frontend client), follow these universal steps:

### Step 1: Model Definition & Serialization

Create Data Transfer Objects (DTOs) or Models in your target language. Implement robust JSON serialization that translates your language's naming conventions to `snake_case`.

**Pseudo-code Example:**

```text
class Job {
    String id;
    String title;
    String createdAt; // maps to "created_at" in JSON

    function toJSON() {
        return {
            "id": this.id,
            "title": this.title,
            "created_at": this.createdAt
        }
    }
}
```

### Step 2: HTTP Client Wrapper

Wrap your native HTTP client (e.g., `fetch` in JS, `http` in Dart, `requests` in Python) to handle base URLs and default headers automatically.

**Pseudo-code Example:**

```text
class CataquiClient {
    String baseUrl = "https://api.cataqui.com/v1"

    function get(path, queryParams) {
        url = baseUrl + path + formatQuery(queryParams)
        return HTTP.GET(url, headers: {"Accept": "application/json"})
    }

    function post(path, body) {
        url = baseUrl + path
        return HTTP.POST(url, body: toSnakeCaseJSON(body), headers: {"Content-Type": "application/json"})
    }
}
```

### Step 3: Implement Infinite Scroll (Cursor Pagination)

For the Feed UI, maintain the `next_cursor` in your state. When the user scrolls to the bottom, pass this cursor to the `getFeed` method.

**Pseudo-code Example:**

```text
state currentCursor = null
state feedItems = []

function loadMore() {
    response = CataquiClient.get("/feed", { "cursor": currentCursor })
    feedItems.append(response.data)
    currentCursor = response.meta.next_cursor
}
```

## Best Practices

- **Avoid strict null checks on outputs:** Design your client models flexibly. While the API aims to be strongly typed, defensive programming on the client ensures the app won't crash if an unexpected null field arrives.
- **Map Error Codes:** Look for `error_code` in a 4xx/5xx response JSON. Use a switch/case block to present localized error messages to the user (e.g., if `error_code == 'RATE_LIMITED'`, show "You're doing that too fast").
