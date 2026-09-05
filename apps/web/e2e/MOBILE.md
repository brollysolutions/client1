# Mobile layout verification

`mobile-layout.spec.ts` discovers all 77 App Router page modules. It expands
calculator and catalogue parameters into 98 route scenarios and checks each
at 320, 390, 768 and 1365 pixels. Additional scenarios cover all six role
drawers, public navigation, a populated approval dialog, a product editor,
mobile sorting, and OTP/password entry (109 scenarios in total).
The suite saves a 390px screenshot for each route in ignored `test-results`.

Run the existing synthetic catalogue server in one terminal:

```powershell
node e2e/fixtures/release-catalogue-server.mjs
```

Run the web app in another terminal (from `apps/web`):

```powershell
$env:API_INTERNAL_URL='http://127.0.0.1:4311'
pnpm dev
```

Then run the browser checks:

```powershell
pnpm test:e2e mobile-layout.spec.ts
```

Set `PLAYWRIGHT_BASE_URL` if the web server uses another local port. Use the
Playwright browser revision installed for the repository's locked package.

Authenticated requests are intercepted with synthetic responses derived from
the committed OpenAPI schema, plus explicit form and populated-list fixtures.
No real account, OTP, upload, payout, or customer data is needed. Hidden
anti-spam controls remain untouched and are excluded from visible-field bounds.

This is UI verification, not evidence of backend authorization or full live
business journeys. Most operational lists use empty states; review and support
queues have populated records. Dynamic records use synthetic detail responses,
and invitation/not-found behavior remains part of the route sweep. Keep the
existing API-backed journey tests as the separate integration gate.
