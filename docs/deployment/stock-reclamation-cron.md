# Deployment Guide: Stock Reclamation Cron

This document covers deployment and operations for the automated abandoned-order expiration job.

## Purpose

Prevents stock hoarding from abandoned Stripe/payment sessions by automatically:

1. finding stale `PENDING_PAYMENT` orders
2. cancelling those orders
3. restoring held inventory back to `inventory`

---

## Runtime behavior

The scheduler is initialized in `src/app.ts` after server start:

- Schedule: `*/10 * * * *` (every 10 minutes)
- Service call: `cronService.expireAbandonedOrders(30)`
- Expiration threshold: 30 minutes

So every run, orders older than 30 minutes in `PENDING_PAYMENT` are reclaimed.

---

## Implementation references

- Scheduler startup: `src/app.ts`
- Core cleanup logic: `src/services/cron.service.ts`
- Integration test: `tests/cron.test.ts`

---

## Data effects

For each stale order:

- `orders.status` -> `CANCELLED`
- `orders.payment_status` -> `UNPAID` (schema-valid enum)
- each `order_items.quantity` is added back to `inventory.quantity`

All actions run in one DB transaction per cron run.

---

## Deployment checklist

## 1) Build and run migrations

```bash
npm install
npm run build
npm run migrate:prod
```

## 2) Ensure process is always running

The cron runs **inside the API process**, so process uptime is required.

Use your process manager (PM2/systemd/Docker/K8s) to keep at least one API instance alive.

## 3) Avoid duplicate reclaim execution across many replicas

If multiple app replicas run simultaneously, each runs its own cron.  
Current SQL is transaction-safe, but to reduce duplicate work/noise:

- Prefer single API replica for early-stage deployments, or
- Move cron to a dedicated worker process, or
- Add a DB/distributed lock before running cleanup.

---

## Monitoring recommendations

Track these log patterns:

- Success with work done:
  - `Cron cleanup: expired X abandoned pending-payment orders.`
- Failures:
  - `Cron cleanup failed while expiring abandoned orders: ...`

Suggested alerts:

- Error rate > 0 in cron logs
- sustained high `expiredCount` spikes (potential checkout/payments UX issue)

---

## Verification commands

```bash
npm run test:cron
npm test
```

Both should pass before production rollout.

---

## Rollback strategy

If cron behavior needs emergency stop:

1. temporarily disable scheduler code in `src/app.ts` and redeploy
2. keep `cron.service.ts` and tests intact
3. re-enable after root-cause fix and validation

For future hardening, add an env flag (for example `CRON_STOCK_RECLAIMER_ENABLED`) to allow no-code toggle at runtime.
