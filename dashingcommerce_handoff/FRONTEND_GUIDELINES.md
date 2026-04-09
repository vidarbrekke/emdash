# Frontend Guidelines

## Required Layers
- API Client
- Hooks
- UI Components

## Rules
- No business logic
- Always fetch fresh data after mutations
- Backend is authoritative

## Checkout Flow
1. Create checkout
2. Lock cart (backend)
3. Payment
4. Webhook finalize
5. Fetch order
