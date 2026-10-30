# v0.3 browser acceptance — 2026-10-30

Status: INCOMPLETE. Do not interpret compilation checks as full browser acceptance.

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
