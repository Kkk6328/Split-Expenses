# LINE-only backend — awaiting deployment

This is a Cloudflare Workers + D1 adapter. It verifies each LINE ID token against LINE's official verify endpoint using channel 2012396328, then scopes database access to verified membership. It does not require Firebase service-account credentials, a Channel Secret, or Google login. Use the Workers Free plan and D1 free allocation; do not activate a paid subscription.

Deployment requires the owner's Cloudflare account. Create D1 `split-expenses`, put its returned ID in wrangler.jsonc, apply schema.sql, deploy worker.js, and put the returned HTTPS endpoint into config.js lineApiBase. Keep lineApiBase blank until deployed and verified. Current production therefore retains Google authentication; the staged backend is not yet live.

Verify create/list/save, nonmember rejection, invitation join with another LINE account, owner-only delete/restore, invitation revocation, version conflicts, and old-data migration before switching production. Existing Firebase records are retained and are not automatically migrated. Before switching, the old Google-owned books must be copied to the correct LINE owner through an explicit migration flow; that flow remains to be implemented and verified with the deployed backend.

Invitations have no automatic expiry. The owner may revoke all existing invitations; new ones can then be generated. Revocation does not remove members already joined.
