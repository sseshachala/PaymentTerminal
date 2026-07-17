# AI Voice Sales & Payment Agent

## Vision

> **From "Hello" to paid order, handled by one AI agent.**

Inbound calls answered by an AI that understands the service catalog, builds the order, confirms with the customer, and completes payment securely — 24 hours a day.

First customer: friend's business (~$40-50K/month volume).

---

## Call Flow

```
Customer calls Twilio number
        │
        ▼
POST /api/voice/incoming
        │
        ▼
AI conversation (Claude)
  ├── Identify customer
  ├── Understand need
  ├── Explain services + pricing
  ├── Build order (line items)
  ├── Confirm terms + consent
  └── Request payment
        │
        ▼
Twilio <Pay> — secure DTMF capture
  - Speech transcription pauses
  - Call recording pauses/masks
  - Digits never enter AI context
        │
        ▼
Stripe / Square (existing charge logic)
        │
        ▼
AI resumes
  - Confirms approval + order number
  - Sends SMS + email receipt
  - Escalates if declined or high-value
```

---

## PCI Note

Customer enters card on keypad — they do NOT speak the number to the AI.

Agent says: *"I'm placing the call into secure payment mode. Please enter your card number using your telephone keypad. I will not hear or record the numbers."*

Twilio `<Pay>` handles DTMF interception and tokenization. Card data never touches this app or the AI context.

---

## What the AI Is Allowed to Know

```json
{
  "order_id": "ORD-10452",
  "customer_name": "Jane Smith",
  "service": "Annual maintenance package",
  "amount": 1250,
  "payment_status": "approved",
  "transaction_reference": "pi_...",
  "card_brand": "visa",
  "card_last4": "4242"
}
```

Never: full card number, CVV, raw DTMF digits, unmasked card data in transcripts.

---

## Architecture — Stays in This App

New routes only:
- `POST /api/voice/incoming` — Twilio webhook, starts conversation
- `POST /api/voice/respond` — AI turn, returns TwiML
- `POST /api/voice/payment` — triggers Twilio `<Pay>`
- `POST /api/voice/complete` — payment result, receipt, audit log
- `POST /api/voice/escalate` — transfers to human

New DB tables:
- `voice_sessions` — caller ID, conversation state, order in progress
- `service_catalog` — services, prices, descriptions the AI uses

Stays exactly the same:
- Customers table + encryption
- Payment routing (Stripe / Square)
- Line items + tax
- Email receipts
- Audit log

External additions (just API keys):
- **Twilio** — phone number + Programmable Voice + `<Pay>`
- **Claude API** — conversation

---

## Competitive Landscape

| Platform | Gap |
|---|---|
| Sierra | Enterprise, 6-figure contracts |
| PolyAI | Enterprise, long implementation |
| Replicant | Contact-center focused |
| **Our target** | Small/mid service businesses, deployable in days |

---

## Build Sequence (First Version)

1. Twilio inbound number → `/api/voice/incoming`
2. Claude handles conversation, builds order against service catalog
3. Twilio `<Pay>` captures card → existing Stripe charge route
4. Receipt via existing email system
5. Human transfer for escalations

One vertical, one business, one call flow. Prove a real customer calls, gets quoted, and pays without a human touching the call.

---

## Positioning

> **AI receptionist + service advisor + scheduler + secure payment agent**
> Setup in hours. Affordable for a business processing $40K–$50K/month.

---

## Open Questions for Tomorrow

- What services does the friend's business actually offer? (catalog scope)
- Do they want appointment scheduling in v1 or just quote + payment?
- What's their escalation number / hours?
- Do they want SMS confirmation in addition to email?
- Twilio account — do they have one or do we provision?
