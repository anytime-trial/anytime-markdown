# API Specification

## 1. Overview

- **Base URL:** `https://api.example.com/v1`
- **Authentication:** Bearer Token
- **Content-Type:** `application/json`

## 2. Authentication

All requests require an `Authorization` header:

```
Authorization: Bearer <token>
```

## 3. Endpoints

### 3.1 List Resources

`GET /resources`

**Query Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page (default: 20) |

**Response: 200 OK**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Example"
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

### 3.2 Create Resource

`POST /resources`

**Request Body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| name | string | Yes | Resource name |

**Response: 201 Created**

```json
{
  "id": 1,
  "name": "Example",
  "created_at": "2026-01-01T00:00:00Z"
}
```

## 4. Error Codes

| Code | Message | Description |
| --- | --- | --- |
| 400 | Bad Request | Invalid request body |
| 401 | Unauthorized | Missing or invalid token |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Unexpected error |

**Error Response Format:**

```json
{
  "error": {
    "code": 400,
    "message": "Bad Request",
    "details": "Field 'name' is required"
  }
}
```

## 5. Change History

| Version | Date | Description |
| --- | --- | --- |
| 1.0 | YYYY-MM-DD | Initial version |
