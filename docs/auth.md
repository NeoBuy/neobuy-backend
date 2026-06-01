# Authentication API

Base path: `/api/auth`

All request and response bodies are JSON. Passwords are hashed with **bcrypt** before storage. Successful login returns a **JWT** (7-day expiry) signed with `JWT_SECRET`.

---

## POST `/api/auth/register`

Create a new customer account. Phase 1 assigns the **CUSTOMER** role and links the user to the internal **NeoBuy** merchant.

### Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | No* | Account email (unique when set) |
| `phone` | string | No* | Account phone (unique when set) |
| `password` | string | Yes | Plain-text password (hashed server-side) |

\* At least one of `email` or `phone` is required.

### Example request

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "customer@example.com",
  "phone": "+94771234567",
  "password": "SecurePass123!"
}
```

### Success response — `201 Created`

```json
{
  "success": true,
  "message": "Account initialized successfully.",
  "data": {
    "id": 1,
    "email": "customer@example.com",
    "phone": "+94771234567"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` on success |
| `message` | string | Human-readable status |
| `data.id` | number | New user ID |
| `data.email` | string \| null | Registered email |
| `data.phone` | string \| null | Registered phone |

### Error response — `400 Bad Request`

```json
{
  "success": false,
  "message": "An account with this email or phone number already exists."
}
```

Common `message` values:

- `Either an email or phone number must be provided.`
- `Password is required.`
- `An account with this email or phone number already exists.`

---

## POST `/api/auth/login`

Authenticate with email **or** phone plus password.

### Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | No* | Login email |
| `phone` | string | No* | Login phone |
| `password` | string | Yes | Account password |

\* Provide `email` **or** `phone` (or both if they belong to the same account).

### Example request (email)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "customer@example.com",
  "password": "SecurePass123!"
}
```

### Example request (phone)

```http
POST /api/auth/login
Content-Type: application/json

{
  "phone": "+94771234567",
  "password": "SecurePass123!"
}
```

### Success response — `200 OK`

```json
{
  "success": true,
  "message": "Authentication successful.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "customer@example.com",
      "phone": "+94771234567",
      "roles": ["CUSTOMER"]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` on success |
| `message` | string | Human-readable status |
| `data.token` | string | JWT access token (Bearer) |
| `data.user.id` | number | User ID |
| `data.user.email` | string \| null | User email |
| `data.user.phone` | string \| null | User phone |
| `data.user.roles` | string[] | Role codes, e.g. `CUSTOMER`, `ADMIN` |

### JWT payload

Decoded token claims (for protected routes):

```json
{
  "id": 1,
  "email": "customer@example.com",
  "roles": ["CUSTOMER"],
  "iat": 1717238400,
  "exp": 1717843200
}
```

Send the token on protected requests:

```http
Authorization: Bearer <token>
```

### Error response — `401 Unauthorized`

```json
{
  "success": false,
  "message": "Invalid authentication credentials."
}
```

Returned when credentials are missing, the user is not found, the password is wrong, or the account is **BLOCKED**.

---

## TypeScript types (reference)

Defined in `src/types/auth.ts`:

- `RegisterUserInput`, `RegisteredUser`
- `LoginUserInput`, `AuthSessionData`, `AuthSessionUser`
- `AccessTokenPayload` (JWT / `req.user`)
