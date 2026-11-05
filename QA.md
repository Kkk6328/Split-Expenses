# 2026-11-05 functionality and interface review

## Changes

- LINE API requests reject stale tokens before writes, clear authenticated UI on HTTP 401, and provide a direct sign-in recovery action.
- Authentication is announced only after the backend accepts the LINE ID token.
- External browsers clear their previous LIFF login before reauthentication; LIFF browsers reopen their LIFF entry URL. Invitations are retained during that recovery.
- New-book names are retained in session storage for the same account. Writes are never automatically replayed.
- Owner-only invitation and book management actions; one invitation button per book.
- Sync, CSV export, revoke invitations and delete are in the book menu; legacy import, trash and instructions are in the sidebar menu.
- Neutral slate palette, consistent form styling, 44px controls, scrollable mobile dialogs, 16px mobile form text and responsive expense rows.
- Old Worker capability errors have a clear update-required message.

## Verification

- Automated authentication tests: `node tests/line-auth.test.cjs`.
- Worker isolation tests using SQLite and mocked LINE verification: `node line-backend/permissions.test.mjs`.
- Syntax checks for application and authentication adapter.
- Exact-cent three-person remainder distribution and zero-sum balance calculations.
- Browser QA with isolated synthetic data: create, FX conversion, expense editing, settlement and undo, soft delete and restore, account-specific management visibility, old-backend message, login recovery, downloaded CSV contents.
- Visual QA at 390px in an iframe with the production stylesheet and markup.

## Verification limits and activation

The new membership Worker source still needs to be deployed to the user's Cloudflare Worker. The screenshot's "unknown operation" is reproduced when the frontend's capability request reaches the older Worker. Copy `line-backend/worker.js` into the existing Worker's editor and deploy; keep existing DB binding and environment variables.

This review does not claim a new production cross-account LINE join or live Firebase migration test. Browser QA uses synthetic data, and LINE token verification is mocked in automated tests. Existing stored books are not deleted by these changes.
