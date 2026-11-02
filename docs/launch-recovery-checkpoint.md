# Launch work checkpoint

## Live and saved

Apps Script deployment version 14 was confirmed on 2 November 2026 at 08:33 India time. The existing endpoint and permissions were retained. It adds item quantity/price validation and a full-table guard before inventory processing. Git commit 86ce4f7 preserves the deployed changes and regression tests. Payments remain manual through the owner and WhatsApp.

The actual backend was already version 13 when inspected; do not repeat the handoff's assumption that the November 2 changes are undeployed.

## Backup execution and resolved access issue

Backups.gs is installed in the bound project. The first run copied two spreadsheets and failed on the client-log sheet. Investigation confirmed that the log sheet belonged to a different Google account and was private. The owner authorized Editor access for the backend account; the sharing dialog verified Editor access with general access still Restricted. A subsequent backup on 2 November 2026 at 08:45 India time completed: three spreadsheets copied, zero failures. Its manifest is in the timestamped private backup folder in the owner Drive. No original records or spreadsheet references were replaced. An isolated restore drill completed successfully at 16:07 India time: all three restored spreadsheets matched their backup values, formulas, number formats and sheet metadata. Production was not overwritten. No recurring backup schedule is enabled.

## Prepared but not activated

apps-script/Backups.gs contains a manually invoked backup function with per-source copies and a manifest. It is installed and was executed as described above, but is not scheduled. Tests cover deduplication, complete copies, and partial failures. It does not back up credentials, script properties, uploaded images or repository source. It does not delete backups. Storage and retention still need operational review.

The clientData_ safeguard is deployed in version 15 (2 November 2026 at 16:08 India time): inaccessible existing client databases throw a clear error instead of silently creating empty replacements and overwriting the client reference. Two regression tests cover this. Backup and restore utilities are included in that release. The restore helper is semantically equivalent between source and the editor, with different formatting and declaration order.

## Resume safely

Use the owner Chrome profile and open the script bound to the studio spreadsheet. The other Chrome profile has a multi-account Apps Script error. Never replace all code without comparing the current editor against the repository. Never run setup or tidyUp merely to test access.

Next implement and test the durable order recovery journal and cancellation handling, followed by live customer-flow verification. Client approval of the storefront content was requested and remains pending. No new permission grant should be accepted without reviewing its scope.

## Unfinished work

- Durable order idempotency and acknowledgement: t.js uses no-cors fire-and-forget and a weak browser-only deduplication key. Do not advertise successful persistence without an acknowledgement.
- Order/stock consistency: takeStock_ still precedes order append. Need a durable recovery journal, concurrent-write protection, and fault-injection tests. The new validation guards do not solve this.
- Cancellation/restocking exactly once, variant identifiers, overselling controls, reconciliation and alerts.
- Backups in production, restore drill, uploads coverage, retention and scheduling.
- Security review of sessions, PINs, authorization, uploads and repository publishing. Do not expose credentials in logs or commits.
- Confirm live client records before merging duplicates. Never infer payments, stock, delivery dates, authentic reviews or approved product details.
- Verify editor publish/restore, request attachments, production form persistence and notifications.
- Client-approved storefront content, privacy information and care scope. Avoid inventing policy promises or signing contracts.

## Verification

Run node --test tests/*.test.mjs. Seven tests passed at this checkpoint. These are local tests; they do not establish live end-to-end readiness.

No unfinished order workflow has been deployed. Version 15 is the live backend. No unfinished order workflow has been deployed.
