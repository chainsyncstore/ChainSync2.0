# ChainSync 2.0 - Authentication Flow Visualization

## Quick Reference Flow Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        A[Login Request<br/>Email/Username + Password]
    end
    
    subgraph "Middleware Layer"
        B[Rate Limiting<br/>authRateLimit]
        C[Bot Prevention<br/>CAPTCHA Check]
        D[CSRF Protection<br/>Token Validation]
    end
    
    subgraph "Validation Layer"
        E[Zod Schema Validation<br/>LoginSchema]
        F[Parse Credentials<br/>Email or Username]
    end
    
    subgraph "Database Layer"
        G[User Lookup<br/>storage.getUserByEmail]
        H[PostgreSQL Query<br/>SELECT * FROM users]
        I[Field Mapping<br/>snake_case → camelCase]
    end
    
    subgraph "Security Layer"
        J[Account Lock Check<br/>isAccountLocked]
        K[Password Verification<br/>bcrypt.compare]
        L[Failed Attempt Tracking<br/>recordFailedLogin]
        M[Lockout Enforcement<br/>After 5 attempts]
    end
    
    subgraph "Session Layer"
        N[Session Regeneration<br/>req.session.regenerate]
        O[Redis Storage<br/>chainsync:sess:*]
        P[Cookie Setting<br/>httpOnly, sameSite]
    end
    
    subgraph "Response Layer"
        Q[Success Response<br/>User Data - Password]
        R[Error Response<br/>Generic Message]
        S[Security Alert<br/>Email Notification]
    end
    
    A --> B --> C --> D
    D --> E --> F
    F --> G --> H --> I
    I --> J
    J -->|Not Locked| K
    J -->|Locked| R
    K -->|Valid| N
    K -->|Invalid| L
    L --> M --> S
    M --> R
    N --> O --> P
    P --> Q
```

## Authentication State Machine

```mermaid
stateDiagram-v2
    [*] --> LoginRequest
    
    LoginRequest --> RateLimitCheck
    RateLimitCheck --> BotPrevention : Pass
    RateLimitCheck --> TooManyRequests : Fail
    
    BotPrevention --> InputValidation : Pass
    BotPrevention --> InvalidCaptcha : Fail
    
    InputValidation --> UserLookup : Valid
    InputValidation --> InvalidInput : Invalid
    
    UserLookup --> UserFound : Exists
    UserLookup --> UserNotFound : Not Exists
    
    UserFound --> AccountLockCheck
    AccountLockCheck --> AccountLocked : Locked
    AccountLockCheck --> PasswordCheck : Active
    
    PasswordCheck --> PasswordValid : Match
    PasswordCheck --> PasswordInvalid : No Match
    
    PasswordInvalid --> IncrementFailures
    IncrementFailures --> CheckLockThreshold
    CheckLockThreshold --> LockAccount : >= 5 attempts
    CheckLockThreshold --> SendAlert : < 5 attempts
    
    PasswordValid --> EmailVerified : Required
    PasswordValid --> CreateSession : Not Required
    EmailVerified --> CreateSession : Verified
    EmailVerified --> VerificationRequired : Not Verified
    
    CreateSession --> SessionRegenerate
    SessionRegenerate --> StoreInRedis
    StoreInRedis --> SetCookie
    SetCookie --> LoginSuccess
    
    LoginSuccess --> [*]
    TooManyRequests --> [*]
    InvalidCaptcha --> [*]
    InvalidInput --> [*]
    UserNotFound --> [*]
    AccountLocked --> [*]
    SendAlert --> [*]
    LockAccount --> [*]
    VerificationRequired --> [*]
```

## Data Flow Through Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HTTP REQUEST                                 │
│  POST /api/auth/login                                               │
│  Body: { email: "user@example.com", password: "SecurePass123!" }    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MIDDLEWARE PIPELINE                             │
│  1. authRateLimit          → Check request rate                     │
│  2. botPreventionMiddleware → Verify CAPTCHA if required            │
│  3. CSRF Protection        → Validate CSRF token                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VALIDATION (Zod Schema)                         │
│  LoginSchema.safeParse(req.body)                                    │
│  - Email format validation                                          │
│  - Password min length (8 chars)                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE QUERY (PostgreSQL)                       │
│  SELECT * FROM users WHERE email = 'user@example.com'               │
│                                                                      │
│  Result: {                                                          │
│    id: "uuid-123",                                                  │
│    email: "user@example.com",                                       │
│    password_hash: "$2b$12$...",                                     │
│    email_verified: true,                                            │
│    failed_login_attempts: 0,                                        │
│    locked_until: null                                               │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SECURITY CHECKS                                 │
│  1. Account Lock Status    → Check locked_until timestamp           │
│  2. Password Verification  → bcrypt.compare(password, hash)         │
│  3. Email Verification     → Check email_verified flag              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SESSION MANAGEMENT (Redis)                        │
│  1. req.session.regenerate()  → New session ID                      │
│  2. Set session data:                                               │
│     - userId: "uuid-123"                                            │
│     - twofaVerified: false                                          │
│  3. Store in Redis:                                                 │
│     Key: "chainsync:sess:abc123..."                                 │
│     Value: {userId, twofaVerified, ...}                             │
│     TTL: 28800 seconds (8 hours)                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      HTTP RESPONSE                                   │
│  Status: 200 OK                                                     │
│  Set-Cookie: chainsync.sid=s:abc123...; HttpOnly; SameSite=Lax     │
│  Body: {                                                            │
│    status: "success",                                               │
│    message: "Login successful",                                     │
│    user: { id, email, firstName, lastName, ... }                   │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Security Checkpoints

| Checkpoint | Purpose | Implementation |
|------------|---------|----------------|
| **Rate Limiting** | Prevent brute force | Max 5 requests/minute per IP |
| **Bot Prevention** | Stop automated attacks | Optional CAPTCHA validation |
| **CSRF Protection** | Prevent cross-site attacks | Token validation + SameSite cookies |
| **Input Validation** | Prevent injection | Zod schema validation |
| **Account Lockout** | Limit failed attempts | Lock after 5 failures for 30 min |
| **Password Hashing** | Secure storage | Bcrypt with 12 salt rounds |
| **Session Fixation** | Prevent hijacking | Regenerate session ID on login |
| **Secure Cookies** | Prevent XSS/MITM | HttpOnly, Secure, SameSite flags |

## Error Response Flow

```
Failed Login Attempt
        │
        ▼
┌─────────────────┐
│ Increment Count │
│ in Database     │
└─────────────────┘
        │
        ▼
┌─────────────────┐     Yes     ┌──────────────────┐
│ Count >= 5?     ├─────────────►│ Lock Account     │
└────────┬────────┘              │ for 30 minutes  │
         │ No                    └──────────────────┘
         ▼
┌─────────────────┐
│ Log to Audit    │
│ Table           │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Send Security   │
│ Alert Email     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Return Generic  │
│ Error Message   │
└─────────────────┘
```

## Component Locations Quick Reference

| Component | File | Key Functions |
|-----------|------|---------------|
| **Login Endpoint** | `server/api/routes.auth.ts:229` | Main login handler |
| **Password Utils** | `server/auth-enhanced.ts:59-71` | Hash & compare |
| **Account Lockout** | `server/auth-enhanced.ts:76-153` | Lock verification & tracking |
| **Session Config** | `server/session.ts:11-42` | Redis/Express setup |
| **Redis Client** | `server/lib/redis.ts:5-22` | Singleton client |
| **Storage Layer** | `server/storage.ts:313-353` | User lookup & field mapping |
| **User Schema** | `shared/schema.ts:29-65` | PostgreSQL table |
| **Session Schema** | `shared/schema.ts:730-736` | Session storage |
| **Validation** | `server/schemas/auth.ts:72-81` | Zod schemas |
| **Session Types** | `server/types/session.d.ts:6-12` | TypeScript definitions |
