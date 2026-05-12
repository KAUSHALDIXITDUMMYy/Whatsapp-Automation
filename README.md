# WhatsApp CRM & Reminder System

Multi-tenant SaaS for small businesses: customer CRM with JSONB custom fields, CSV import with saved mappings, tags and dynamic groups, WhatsApp outbound messaging (Twilio), scheduled reminders (daily cron + BullMQ workers), message logs, and an admin overview.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, Tailwind CSS, React Router |
| Backend | Node.js 20+, Express, TypeScript |
| Database | PostgreSQL (JSONB for `tags` + `custom_fields`) |
| Queue | Redis + BullMQ |
| Auth | JWT (vendor vs admin secrets) |

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ with `pgcrypto`
- Redis 6+ (recommended for production-style queues)

### No Redis on Windows (development)

If installing Redis fails (Chocolatey needs **Run as Administrator**; Docker pull can hit network errors), add to **`server/.env`**:

```env
SKIP_REDIS=true
```

The API will **send WhatsApp inline** in the same process (no BullMQ). Use real **Redis in production** and remove `SKIP_REDIS`.

### Quick infra (Docker)

```bash
docker run --name wa-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=whatsapp_crm -p 5432:5432 -d postgres:16
docker run --name wa-redis -p 6379:6379 -d redis:7-alpine
```

## Setup

### 1. Database schema

```bash
cd server
cp ../.env.example .env
# Edit DATABASE_URL, JWT_SECRET, REDIS_URL, etc.
npm install
npm run db:migrate
npm run db:seed
```

`db:seed` creates an admin user (override with `ADMIN_EMAIL` / `ADMIN_PASSWORD`). Default password if unset: `adminadmin`.

If you already ran an older schema, `npm run db:migrate` also applies `subscription_upgrade.sql` (adds plan columns to `vendors`).

### Subscription tiers (Basic vs Pro)

| | Basic (e.g. yearly fee you set) | Pro (higher fee) |
| --- | --- | --- |
| Message templates | Limited count (`BASIC_MAX_TEMPLATES`, default 5) | Unlimited |
| Sending | Must use a **saved template** for each send (no ad-hoc free-text body) | Saved template and/or **custom message body** |
| WhatsApp “from” number | Shared platform sender (`TWILIO_WHATSAPP_FROM`) | Optional **per-vendor** sender (`whatsapp_sender`) — same Twilio account, verified WhatsApp-enabled number |
| Billing | Not automated here | Assign tier + expiry in **Admin** after payment |

- **Vendor UI:** Dashboard + **Account** (`/settings`) show plan; Pro can save their WhatsApp sender.
- **Admin UI:** `/admin` → pick vendor, set **tier**, **expiry datetime**, optional **Pro WhatsApp sender** (E.164).
- **Env:** `BASIC_MAX_TEMPLATES` (default `5`).

Payment gateways (Razorpay, Stripe, etc.) are not wired in; when a customer pays offline/UPI/card elsewhere, you record **Pro** + **expiry** in admin (or extend the API later with webhooks).

### 2. API server

```bash
cd server
npm run dev
```

API base: `http://localhost:4000`

### 3. Frontend

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` (Vite proxies `/api` to the API in dev).

Set `VITE_API_URL` only if the UI is hosted separately from the API (otherwise leave unset for same-origin proxy).

## WhatsApp / Meta Cloud API (recommended)

1. In Meta Business Portfolio (Business Manager), set up WhatsApp Business Platform (Cloud API) and add a phone number.
2. Create a permanent access token (System User token recommended) with WhatsApp permissions.
3. Set in `server/.env`:

   - `META_WHATSAPP_ACCESS_TOKEN`
   - `META_WHATSAPP_PHONE_NUMBER_ID`
   - `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` (any string you choose)
   - Optional: `META_GRAPH_VERSION` (default `v22.0`)

If these are omitted, outbound jobs still queue and log as **sent** with a `dry-*` provider id (no real WhatsApp delivery).

### Webhook (optional, for inbound + status)

Configure Meta Webhooks callback URL to:

- `POST/GET /api/webhooks/meta/whatsapp`

Use the same verify token as `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

## Architecture notes

- **Tenant isolation:** Every vendor-scoped table includes `vendor_id`. JWT middleware injects `vendorId`; queries always filter by it.
- **Admin:** Separate JWT signing secret (`ADMIN_JWT_SECRET`); routes under `/api/admin/*`.
- **Queues:** `messages_log` rows are created with `status = queued`, then a BullMQ worker calls Twilio and updates `sent` / `failed`.
- **Reminders:** `node-cron` runs daily at **00:15 UTC** (`15 0 * * *`) and enqueues due reminders; each `(rule, customer, calendar day)` is deduped in `reminder_dispatch_log`. You can trigger a manual run: `POST /api/admin/run-reminder-scan` (admin JWT).

## Sample API routes

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/vendor/register` | — |
| POST | `/api/auth/vendor/login` | — |
| POST | `/api/auth/admin/login` | — |
| GET | `/api/profile/me` | Vendor JWT |
| GET/POST | `/api/customers` | Vendor |
| GET/PATCH/DELETE | `/api/customers/:id` | Vendor |
| GET/POST | `/api/fields` | Vendor |
| GET/POST | `/api/groups` | Vendor |
| GET | `/api/groups/:id/preview` | Vendor |
| POST | `/api/import/preview` | Vendor (multipart) |
| POST | `/api/import` | Vendor (multipart + mapping JSON) |
| GET/POST | `/api/messaging/templates` | Vendor |
| POST | `/api/messaging/send` | Vendor |
| GET | `/api/messaging/logs` | Vendor |
| GET/POST | `/api/reminders` | Vendor |
| GET | `/api/admin/vendors` | Admin JWT |
| GET | `/api/admin/stats` | Admin JWT |

### Example: send bulk by tag

```http
POST /api/messaging/send
Authorization: Bearer <vendor_jwt>
Content-Type: application/json

{
  "mode": "bulk",
  "template_id": "<uuid>",
  "filters": {
    "tags": ["VIP"],
    "tag_mode": "any"
  }
}
```

### Example: customer payload

```json
{
  "name": "Rahul",
  "phone": "9999999999",
  "tags": ["VIP"],
  "custom_fields": {
    "recharge_date": "2026-05-10",
    "plan": "499"
  }
}
```

## Production build

```bash
cd client && npm run build
cd ../server && npm run build && npm start
```

Serve `client/dist` as static files behind the same host as `/api`, or configure `VITE_API_URL` to the public API URL.

## License

MIT (adjust as needed).
