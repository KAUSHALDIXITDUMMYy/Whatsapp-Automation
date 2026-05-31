# Platform WhatsApp templates (upload in Meta manually)

Vendors do **not** create templates in the app. Upload these in [Meta WhatsApp Manager](https://business.facebook.com/) → **Account tools** → **Message templates**, then set the **exact names** in `server/.env`.

| Env variable | Template name | When it is sent |
|--------------|---------------|-----------------|
| `META_TEMPLATE_WELCOME` | `cable_welcome_onboard` | New subscriber added by vendor |
| `META_TEMPLATE_RECHARGE` | `cable_recharge_reminder` | Daily job on recharge due date |

Customer self-service (visit / call / chat) uses **session messages** after the customer sends *Hi* — no template needed for those flows.

---

## Why Meta rejects templates (common causes)

| Mistake | Fix |
|---------|-----|
| Category **Marketing** for reminders | Use **Utility** for both templates below |
| Words like *welcome aboard*, *thank you for choosing* | Use factual account / billing language |
| Markdown `*Hi*` or `_bold_` in body | Plain text only — no asterisks or underscores |
| *Reply Hi* / *click here* / URLs | Remove; say “message us on this chat” if needed |
| Wrong language (`en` vs `en_US`) | Pick **one** language when creating; use **English (US)** |
| Template name ≠ env name | Name must be exactly `cable_welcome_onboard` and `cable_recharge_reminder` |
| Vague variables | Use sample values: name `Rahul`, date `15 June 2026` |
| Editing a rejected template | **Delete** it and create a **new** template with the same name |

---

## How to create in Meta (step by step)

1. [business.facebook.com](https://business.facebook.com/) → your **WhatsApp account** → **Message templates** → **Create template**.
2. **Name:** copy exactly from tables below (lowercase, underscores only).
3. **Category:** **Utility** (not Marketing).
4. **Language:** **English (US)** (`en_US`).
5. **Components:** **Body** only (no header, footer, or buttons for first approval — simplest).
6. Paste the **body** text exactly (including `{{1}}`, `{{2}}`).
7. **Sample content** when Meta asks:
   - `{{1}}` → `Rahul`
   - `{{2}}` → `15 June 2026` (recharge template only)
8. Submit → wait for **Approved** (often minutes to 48 hours).
9. Restart your API after approval.

---

## Template 1 — `cable_welcome_onboard`

| Field | Value |
|-------|--------|
| **Name** | `cable_welcome_onboard` |
| **Category** | **Utility** |
| **Language** | English (US) |

### Body (copy-paste)

```
Hello {{1}}, your cable TV subscription is now active. You can message us on this chat for billing, technician visits, or support.
```

| Variable | Filled by app | Sample for Meta |
|----------|----------------|-----------------|
| `{{1}}` | Subscriber name | `Rahul` |

### Do not use (often rejected)

```
Hello {{1}}, welcome aboard! Thank you for choosing our cable TV service. Reply *Hi* anytime for...
```

---

## Template 2 — `cable_recharge_reminder`

| Field | Value |
|-------|--------|
| **Name** | `cable_recharge_reminder` |
| **Category** | **Utility** |
| **Language** | English (US) |

### Body (copy-paste)

```
Hello {{1}}, your cable TV recharge is due on {{2}}. Please complete payment before this date to avoid service interruption.
```

| Variable | Filled by app | Sample for Meta |
|----------|----------------|-----------------|
| `{{1}}` | Subscriber name | `Rahul` |
| `{{2}}` | Due date | `15 June 2026` |

### Do not use

- Category **Marketing** for payment reminders  
- Threatening text (“service will be cut today”)  
- Discounts, offers, or “limited time” language  

---

## Easier approval option (no variables)

If Meta still rejects the welcome template, use a **zero-variable** version. The app supports templates with no placeholders.

**Name:** `cable_welcome_onboard`  
**Category:** Utility  
**Body:**

```
Your cable TV subscription is now active. Message us on this chat for billing, technician visits, or support.
```

For recharge, a **one-variable** version (date only) also approves more easily:

**Name:** `cable_recharge_reminder`  
**Body:**

```
Your cable TV recharge is due on {{1}}. Please pay before this date to continue service.
```

Sample for `{{1}}`: `15 June 2026`  

> If you use the one-variable recharge template, tell us — the app expects `{{1}}` = name and `{{2}}` = date by default. The two-variable version above is recommended.

---

## `.env` (after approval)

```env
META_TEMPLATE_WELCOME=cable_welcome_onboard
META_TEMPLATE_RECHARGE=cable_recharge_reminder
```

Language is resolved automatically from Meta’s approved template list. If sends fail with “translation does not exist”, recreate the template using **English (US)** only.

---

## Verify templates are live

1. In Meta Manager, status must show **Approved** (green).
2. Add a test subscriber in your app → check `messages_log` for `status = sent` (not `failed`).
3. If `failed`, read `provider_error` in the database or server logs.

---

## Hindi templates (optional, India)

Create **separate** templates (e.g. `cable_welcome_onboard_hi`) and point env vars to those names. Example welcome body:

```
नमस्ते {{1}}, आपका केबल TV कनेक्शन सक्रिय हो गया है। बिलिंग और टेक्निशियन के लिए इस चैट पर संदेश भेजें।
```

Use Utility category and Hindi language in Meta.
