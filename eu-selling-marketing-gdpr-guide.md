# Selling & Marketing to EU Customers — Practical Compliance Guide (GDPR-Aligned)

## Purpose

This document explains how to **legally sell to EU customers and market to them after purchase**, with a focus on practical implementation for an eCommerce business using WooCommerce + custom backend services.

It is written as a **developer + operator playbook**, not a legal essay.

---

# Core Principle

When dealing with EU customers under the General Data Protection Regulation (GDPR):

> You may use customer data only for a **specific legal basis**, and you must not expand usage without justification.

Everything below maps to that.

---

# Section 1 — Selling to EU Customers (Pre‑Purchase + Transaction)

## 1.1 Legal basis for processing

During purchase, you can process personal data under:

- **Contractual necessity**

This covers:

- checkout
- payment processing
- shipping
- order confirmation
- customer support related to the order

### What this means in practice

You **DO NOT need consent** for:

- collecting shipping address
- sending order confirmation emails
- sending shipping updates
- fraud checks
- tax calculations

---

## 1.2 What data you can collect at checkout

Only collect what is necessary:

### Required

- name
- email
- billing address
- shipping address
- phone (if required for delivery)

### Avoid collecting

- unnecessary demographics
- preferences not tied to fulfillment
- marketing opt-ins bundled into checkout

---

## 1.3 Checkout requirements

### Must-have

- clear privacy policy link
- explanation of:
  - what data is collected
  - why
  - how long it is stored

### Must NOT do

- pre-check marketing consent boxes
- hide consent inside terms & conditions
- bundle consent with checkout completion

---

## 1.4 Order storage rules

You are allowed to retain order data for:

- accounting
- tax compliance
- fraud prevention

### Implementation rule

- **retain order records**
- **anonymize personal fields when required**

---

# Section 2 — Marketing to EU Customers (Post‑Purchase)

This is where most violations happen.

---

## 2.1 The big rule

You **cannot market freely just because someone bought from you**

Marketing requires a separate legal basis.

---

## 2.2 Legal bases for marketing

There are only two viable paths:

### Option A — Explicit consent (safest)

User explicitly opts in to marketing.

#### Requirements

- unchecked checkbox
- clear wording:
  - “I want to receive marketing emails”
- separate from checkout

---

### Option B — “Soft opt-in” (limited use)

You may email existing customers **about similar products** if:

- they purchased from you
- they were given a chance to opt out at checkout
- every email includes unsubscribe

### Practical advice

Use this carefully. Consent is cleaner and safer.

---

## 2.3 What counts as marketing

Marketing includes:

- newsletters
- promotions
- product recommendations (if not strictly transactional)
- abandoned cart emails (often considered marketing)

---

## 2.4 What is NOT marketing

Allowed without consent:

- order confirmations
- shipping updates
- receipts
- customer service replies

---

# Section 3 — Email Marketing Rules

## 3.1 Required features

Every marketing email must include:

- unsubscribe link
- sender identity
- reason for receiving email

---

## 3.2 Unsubscribe behavior

- must be **one-click or very simple**
- must be honored immediately
- must not require login

---

## 3.3 Data sync rule

When user unsubscribes:

- update central consent store
- propagate to:
  - email provider
  - CRM
  - internal DB

---

# Section 4 — Tracking, Analytics, and Cookies

## 4.1 Rule

Non-essential tracking requires **consent before activation**

---

## 4.2 Categories

### Essential (allowed)

- checkout/session cookies
- fraud/security

### Non-essential (require consent)

- Google Analytics
- Meta pixel
- ad tracking
- personalization engines

---

## 4.3 Implementation pattern

- default: tracking OFF
- enable only after consent
- store consent state

---

# Section 5 — Customer Rights You Must Support

You must support:

## 5.1 Data access

User can request:

- all stored data
- in machine-readable format

---

## 5.2 Data deletion (erasure)

You must:

- delete or anonymize personal data
- retain required financial records

---

## 5.3 Data correction

Users can update incorrect info

---

## 5.4 Data portability

Export data in JSON/CSV

---

# Section 6 — Data Retention

## 6.1 Rule

Do not store personal data indefinitely

---

## 6.2 Practical defaults

- orders: keep (legal requirement)
- marketing data: until unsubscribe or inactivity
- analytics: short window (30–90 days)
- chat logs: limited retention

---

# Section 7 — Third‑Party Services

## 7.1 You are responsible for processors

If you use:

- Stripe
- Mailchimp/Klaviyo
- hosting providers
- analytics tools

You must:

- know what data they receive
- list them in privacy policy
- ensure GDPR-compliant terms

---

# Section 8 — Cross-Border Data Transfers

## 8.1 Reality

If you are US-based:

- EU data likely flows to US systems

---

## 8.2 Requirement

You must use:

- Standard Contractual Clauses (SCCs)
- GDPR-compliant providers

---

# Section 9 — Practical Architecture for Compliance

## 9.1 Separate concerns

Keep GDPR logic in a module:

- consent service
- export service
- erasure service
- audit log

---

## 9.2 Enforcement points

Apply checks at:

- email sending
- analytics tracking
- personalization

---

## 9.3 Logging

Log:

- consent changes
- exports
- deletions

---

# Section 10 — What to Avoid (Common Mistakes)

- pre-checked marketing boxes
- mixing consent with checkout
- sending marketing emails without consent
- tracking users before consent
- storing data forever
- unclear privacy policies

---

# Section 11 — Simple Compliance Checklist

Use this as your operational baseline:

```md
- Separate transactional vs marketing emails
- Require explicit consent for marketing
- Provide unsubscribe in every email
- Disable analytics until consent
- Implement data export endpoint
- Implement delete/anonymize flow
- Track consent state centrally
- Document third-party processors
- Retain only necessary data
```

---

# Bottom Line

You can sell to EU customers easily.

The constraints apply mainly to:

- **marketing**
- **tracking**
- **data retention**

If you follow this model:

> Contract for selling, consent for marketing, minimization for data

You will be operating in a safe, scalable way.

---

# Final Note

This guide is **implementation-focused**, not legal advice.

For high-scale EU targeting, consider validating your setup with a privacy professional.

