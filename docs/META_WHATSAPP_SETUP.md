# Meta WhatsApp Cloud API — credentials setup

This app uses **Meta Graph API only** (no Twilio). You can run everything in **dry-run mode** without credentials: outbound messages log as sent with `dry-*` IDs, and template submit/sync simulates Meta approval after two syncs.

For real WhatsApp delivery and live template registration, complete the steps below.

---

## What you need in `server/.env`

| Variable | Required for | Where it comes from |
|----------|----------------|---------------------|
| `META_WHATSAPP_ACCESS_TOKEN` | Sends + templates | System User permanent token |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Outbound messages | WhatsApp → API Setup |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | Template create/sync | WhatsApp → API Setup (WABA ID) |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Webhooks only | You choose any secret string |
| `META_GRAPH_VERSION` | Optional (default `v22.0`) | Meta API version |

---

## Step 1 — Meta Business Portfolio

1. Go to [Meta Business Suite](https://business.facebook.com/) and open **Business settings**.
2. Create or select a **Business Portfolio** (Business Manager account).
3. Under **Accounts → WhatsApp accounts**, add or create a **WhatsApp Business Account** (WABA).

---

## Step 2 — Meta Developer app (Cloud API)

1. Open [Meta for Developers](https://developers.facebook.com/).
2. **My Apps → Create App** → type **Business** (or use an existing app).
3. Add the **WhatsApp** product to the app.
4. In **WhatsApp → API Setup** you will see:
   - **Phone number ID** → `META_WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** (WABA ID) → `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
5. Add a **test phone number** (development) or complete **business verification** and register a production number.

---

## Step 3 — Permanent access token

Recommended: **System User** token (does not expire when configured correctly).

1. In Business Manager: **Users → System users** → Add.
2. Assign the system user to your **app** with **Full control** (or WhatsApp-related permissions).
3. **Generate new token** for the app with permissions including:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
4. Copy the token into `META_WHATSAPP_ACCESS_TOKEN` in `server/.env`.

Alternative (quick test only): use the temporary token shown on **WhatsApp → API Setup** in the Developer app (expires in ~24 hours).

---

## Step 4 — Configure this application

```bash
cd server
cp ../.env.example .env
# Edit META_* variables
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Restart the API after changing `.env`.

---

## Step 5 — Webhooks (inbound + replies)

The API stores customer messages and lets vendors reply from **Inbox** in the CRM.

1. Expose your API over HTTPS (local dev: `ngrok http 4000` → use the `https://….ngrok-free.app` host).
2. In Developer app → **WhatsApp → Configuration → Webhook**:
   - **Callback URL**: `https://<your-host>/api/webhooks/meta/whatsapp`
   - **Verify token**: same string as `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` in `server/.env`
3. Click **Verify and save**, then subscribe to **`messages`**.
4. Customer phone numbers must exist in **Customers** (same digits as WhatsApp) so inbound webhooks can match them.
5. Vendors open **Inbox** → select conversation → reply (plain text within the 24-hour session window).

---

## Dry-run behavior (no credentials)

| Feature | Behavior |
|---------|----------|
| Send message | Logs `sent` with `dry-<timestamp>` provider id |
| Submit template | `meta_template_id` = `dry-meta-...`, status `pending` |
| Sync template (1st) | Status stays `pending` |
| Sync template (2nd) | Status `approved` → vendor template can materialize |
| Webhook GET verify | Works if `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` is set |

---

## Template types supported via API submit

- **Text**, **Quick reply**, **Call to action** → submitted to Meta `message_templates`.
- **List picker**, **Catalog** → stored in CRM only; create those in [Meta Business Manager](https://business.facebook.com/) and paste the template name/ID when approving manually.

---

## Troubleshooting

- **401 / OAuthException**: Token expired or missing scopes — regenerate system user token.
- **Template rejected**: Body must follow Meta rules (no variables unless declared as `{{1}}`, category must match content).
- **Phone number not messaging**: Number must be connected to the same WABA as `META_WHATSAPP_BUSINESS_ACCOUNT_ID`.

Official reference: [WhatsApp Cloud API docs](https://developers.facebook.com/docs/whatsapp/cloud-api).
