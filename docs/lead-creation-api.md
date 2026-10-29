# Lead Creation API

This document is the source of truth for creating CRM Leads through the existing
canonical endpoint.

## Endpoint

`POST /api/leads`

The endpoint is used by the CRM UI and authenticated API clients. It creates the
same `Lead` model used by the rest of the CRM workflow.

## Authentication and tenant resolution

CRM/API clients must authenticate with the existing JWT authentication flow:

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

The JWT is resolved by the existing `authenticate` middleware. The backend
derives the user and tenant from the token. `tenantId` is never accepted from
the request body.

Only authenticated `Admin` and `Presales` profiles may create Leads through
this endpoint. Super Admin access follows the existing authentication rules.

## Required payload

| Field | Type | Required | Purpose | Example |
|---|---|---:|---|---|
| `lastName` | string | Yes | Lead surname | `"Sharma"` |
| `phone` | string | Yes | Lead phone; whitespace is normalized | `"+91 9876543210"` |
| `company` | string | Yes | Company or organization | `"Example Realty"` |

## Optional payload

| Field | Type | Example |
|---|---|---|
| `firstName` | string | `"Anita"` |
| `salutation` | `MR \| MS \| MRS \| DR \| PROF` | `"MS"` |
| `title` | string | `"Director"` |
| `email` | email string | `"anita@example.com"` |
| `mobile` | string | `"+91 9000000000"` |
| `website` | URL string | `"https://example.com"` |
| `industry` | existing Industry value | `"REAL_ESTATE"` |
| `annualRevenue` | number | `2500000` |
| `numberOfEmployees` | integer | `25` |
| `source` | existing LeadSource value | `"WEBSITE"` |
| `rating` | `HOT \| WARM \| COLD` | `"WARM"` |
| `description` | string | `"Requested a project callback"` |
| `street`, `city`, `stateProvince`, `country`, `postalCode` | string | `"Chennai"` |
| `score` | number | `10` |
| `budget` | number | `7500000` |
| `requirements` | string | `"3 bedroom apartment"` |
| `notes` | string | `"Call after 5 PM"` |
| `projectId` | string | `"cm..."` |

The existing LeadSource values are `WEBSITE`, `REFERRAL`, `COLD_CALL`,
`ADVERTISEMENT`, `WALK_IN`, `PORTAL`, `INSTAGRAM`, `TWITTER`, `WHATSAPP`,
`YOUTUBE`, and `OTHER`.

## Fields rejected as client-controlled

Do not send these fields. The create schema excludes them:

- `tenantId`
- `companyId`
- `leadNumber`
- `ownerId`
- `status`
- `createdById`
- `createdAt`
- `updatedAt`

Unknown fields are not used to override server-owned values.

## Server-generated data

- `id`
- `tenantId`
- `creatorId`
- `leadNumber`
- `ownerId`
- `status`, always initially `NEW`
- `createdAt`
- `updatedAt`
- Presales Owner History
- Lead creation AuditLog

## Example Postman request

```http
POST http://localhost:3001/api/leads
Authorization: Bearer <JWT_FROM_LOGIN>
Content-Type: application/json
```

```json
{
  "firstName": "Anita",
  "lastName": "Sharma",
  "phone": "+91 9876543210",
  "email": "anita@example.com",
  "company": "Example Realty",
  "source": "WEBSITE",
  "notes": "Requested a project callback"
}
```

## Response

The endpoint uses the existing response convention:

```json
{
  "success": true,
  "data": {
    "id": "cm...",
    "tenantId": "cm...",
    "leadNumber": "LN000123",
    "firstName": "Anita",
    "lastName": "Sharma",
    "phone": "+919876543210",
    "company": "Example Realty",
    "source": "WEBSITE",
    "status": "NEW",
    "owner": {
      "id": "cm...",
      "firstName": "Priya",
      "lastName": "Sharma"
    },
    "project": null,
    "createdAt": "2026-09-24T12:30:00.000Z"
  }
}
```

The actual response does not expose passwords, JWTs, or integration secrets.

## Assignment and workflow

Creation assigns the authenticated user as the Lead owner, records Owner
History and AuditLog entries, and starts the Lead at `NEW`. Leads are not
automatically assigned through a queue. Later status changes remain controlled
by the existing workflow.

## Duplicate handling

The canonical phone duplicate rule is shared with CRM creation. A duplicate
phone returns:

```json
{
  "success": false,
  "error": "Phone number already exists for another lead."
}
```

with HTTP `409`. The current schema does not contain a Meta external ID or
idempotency key, and no Meta webhook tenant-mapping mechanism exists in the
repository. Therefore, a secure Meta webhook endpoint is not claimed here.

## Error responses

- `400`: invalid or missing payload, for example missing `phone`
- `401`: missing or invalid authentication
- `403`: authenticated user lacks Lead create access or is not Admin/Presales
- `404`: referenced resources are not found by the relevant existing APIs
- `409`: duplicate phone
- `500`: unexpected server error

## Meta mapping status

There is no existing Meta webhook/integration implementation or secure
integration-secret-to-tenant mapping in this repository. Do not expose a public
Meta endpoint that accepts `tenantId`, `ownerId`, or `status`.

Once a tenant-bound integration credential exists, Meta input should be mapped
to the canonical payload above and submitted through the same Lead creation
service. Until then, Meta Lead Ads are not supported as an authenticated
server-to-server flow.

Conceptual mapping only:

| Meta input | Canonical CRM field |
|---|---|
| `full_name` | split into `firstName` and `lastName` |
| `phone_number` | `phone` |
| `email` | `email` |
| integration source | `source` using an existing LeadSource value |
| campaign metadata | `notes` or `description` only if supplied by an approved mapping |