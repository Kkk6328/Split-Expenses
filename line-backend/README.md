# LINE-only backend

Worker endpoint: https://split-expenses-line.8s8r24zvt2.workers.dev/

User deployed the Worker, configured APP_ORIGIN and LINE_CHANNEL_ID, created D1 from schema.sql, and bound DB. The client uses LINE ID tokens; the server verifies each with LINE's official verify endpoint and checks membership. No Channel Secret or Firebase service-account key is used.

Default frontend uses LINE authentication. Google/Firebase remains available only at ?legacy=1 for explicit old-book export. migration.js copies self-owned books into new LINE-owned books; it never deletes the originals. Reinvite shared members after migration.

Invitations do not expire automatically; the owner can revoke them. Source checks cover storage isolation and invalid-token rejection. A live authenticated LINE create/list/save test and cross-account join test remain necessary to verify the deployed D1 integration. Keep the Workers Free plan; do not activate billing.
