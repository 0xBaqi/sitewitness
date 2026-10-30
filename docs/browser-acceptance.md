# v0.3 browser acceptance — 2026-10-30

Gate A status: INCOMPLETE for real-inference acceptance. Gate B below verifies deterministic browser persistence independently.

Tested the actual application in the desktop in-app browser, first on port 3000 and then the corrected development app on port 3001. No API responses or reports were mocked. No Meta inference requests were made. No credentials were read or recorded.

## Browser observations

- Initial empty state and disabled submission: passed.
- Existing reports: neither tested origin showed any saved reports. Other browser profiles were not inspected.
- Oversized upload: before the fix a 4 MB + 1 byte file enabled submission; after the fix it showed the size error and kept submission disabled.
- Unsupported text upload: showed the supported-format error and kept submission disabled.
- Recovery by selecting a small PNG: cleared the prior error, displayed the image element, and enabled submission with a non-secret dummy access value.
- Whitespace-only question: disabled submission.
- Refresh: attempted, but the browser tool timed out; unverified.

The upload PNG was a one-pixel local test asset, not construction evidence, and was never submitted to Meta.

## Remaining acceptance work

Requires existing authentic reports or a separately authorized controlled inference:

1. Upload an approved photograph; verify the real successful report and IndexedDB photograph survive refresh.
2. Select each finding; edit observations, notes, and decisions rapidly, then refresh and verify exact values.
3. Switch between at least two real reports, including during photograph loading; verify correct image and review association.
4. Export JSON, inspect its report and reviewer values, and confirm no credentials are present. Photographs are not included in JSON exports.
5. Exercise missing photograph, unavailable IndexedDB, storage quota, corrupt saved history, network/server errors and inference failure paths.

No invented findings or SAM annotations were used to bypass these requirements. Browser-local storage remains device/profile/origin specific. The 25-report history cap does not currently remove older photographs from IndexedDB. Stored history validation is shallow and requires further hardening/testing with corrupt records. Full acceptance is not granted.


# Gate B — deterministic browser acceptance (2026-10-30)

Status: PASSED for the synthetic persistence/review/export scope. This is not a Meta inference acceptance result.

## Isolation and reproducibility

- Tests: `tests/browser-acceptance.spec.ts`; configuration: `playwright.config.ts`.
- Fixtures explicitly say SYNTHETIC TEST DATA in filenames, report content, finding titles, notices, and generated canvas images. No photographs of real sites or model-produced findings are claimed.
- Each test receives a fresh Playwright browser context; records and PNG Blobs are seeded into that context's real localStorage/IndexedDB by the test runner. The fixtures are never imported by the application.
- No production injection endpoint, app test-data switch, or mocked Meta response was added.
- The production server is bound to 127.0.0.1:3107 with empty MODEL_API_KEY and SITEWITNESS_ACCESS_CODE environment values. Browser routes abort all /api/analyze and external HTTP requests. No paid requests or credentials were used.
- Install dependencies with `npm ci` and `npx playwright install --with-deps chromium`; run `npm run build` followed by `npm run test:browser`. Port 3107 must be free; the runner does not reuse an existing server.

## Verified evidence

Chromium: two browser tests passed against the production build.

1. IndexedDB restoration, reviews, switching and JSON export: passed (19.3 seconds).
   - Both generated photographs decoded to the expected width, and rendered image bytes exactly matched the Blobs retrieved from real IndexedDB.
   - Selected finding A2 and checked its observation before editing.
   - Stored accepted, rejected, and investigate decisions; edited observations and notes; entered notes character by character to exercise repeated updates.
   - Reloaded and verified exact saved values; switched B → A → B, checking each report's photograph and isolated reviewer state. Both reports deliberately reuse finding IDs to detect cross-report contamination.
   - Downloaded JSON and compared the entire parsed object with the expected B report and edits. Only the expected report fields were exported; no credential fields were present.
   - No uncaught page errors occurred.
2. Missing photograph does not prevent report review: passed (36.2 seconds).
   - Verified the missing-image message, edited notes, refreshed, and verified their exact value.

The test emits `test-results/synthetic-review.png`; results and failure traces are ignored by Git. The initial attempts failed before assertions because the browser runtime/dependencies were not yet installed. After installing standard Playwright Chromium dependencies, both tests passed. No application bug was exposed by Gate B, so this change adds tests/configuration/documentation only.

## Scope still unverified

Real Meta inference and the successful network-response-to-photo-write path were not exercised: fixtures seed storage directly. SAM is not integrated or simulated. Storage quota failures, blocked IndexedDB, corrupted history, concurrent tabs, and rapid asynchronous image-switch races remain separate coverage gaps. Refresh currently selects the newest report and its first finding; it does not restore the previously selected report/finding. JSON export contains report/review data, not photograph bytes. Browser storage remains profile/origin/device specific, and the 25-report cap does not prune older IndexedDB images.

Gate B verification: `npm run typecheck`, `npm run build`, `npm run test:browser` (2 passed), `npm audit` (0 vulnerabilities), and `git diff --check` all passed.


# Pre-inference hardening gate — 2026-10-30

The original two Gate B tests remain unchanged and passed after backend/client hardening. Two additional browser tests passed: 375px mobile layout without horizontal overflow, keyboard finding selection, corrupt saved-history recovery, and busy/disabled controls followed by recovery from a stubbed non-JSON server error. The error stub exists only in the browser test; no model success was manufactured. Final run: 4 passed (33.9 seconds). Initial new-test failures were ambiguous alert selectors matching Next.js's route announcer; scoping assertions to the inspection form resolved them.

Backend suite: 31 deterministic tests passed, covering missing credentials, disabled inference, invalid access/origin, malformed multipart, streaming byte bounds without content-length, empty/oversize/truncated/mismatched image inputs, duplicate fields, question limits, decoded JPEG delivery, instance quotas/reset/spoofed-IP resistance, synthetic model parsing, malformed/incomplete/oversize responses, upstream errors, request/body timeouts, and duplicate finding IDs. No external inference HTTP was permitted.

Production build and TypeScript passed. See production-readiness.md for deployment controls and remaining production blockers; evaluation-plan.md contains planned real-photo cases and metrics, with no fabricated results.
