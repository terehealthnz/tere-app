**To:** Medical-Objects Helpdesk <helpdesk@medical-objects.com.au>
**Cc:** terehealthnz@gmail.com
**From:** terehealthnz@gmail.com
**Subject:** Re: case #1058382 — separate test endpoint live at hl7-test.terehealth.co.nz

Kia ora Tony,

Good pickup — you were right. We were running a single mTLS receiver that had our production hostname on the cert, and pointed you at it for testing. I've now split that into two completely separate Fly apps so test and production have distinct DNS, TLS identity, compute, and message provenance.

**Please switch your test client to:**

`https://hl7-test.terehealth.co.nz/hl7/`

That endpoint has its own Let's Encrypt cert (CN `hl7-test.terehealth.co.nz`) — the "Identity Mismatch" error should now clear.

**What's separated:**

| | Test | Production |
|---|---|---|
| DNS | `hl7-test.terehealth.co.nz` | `hl7.terehealth.co.nz` |
| TLS cert CN | `hl7-test.terehealth.co.nz` | `hl7.terehealth.co.nz` |
| Fly app | `tere-hl7-mtls-test` | `tere-hl7-mtls` |
| Client cert allowlist | your test-network CN | (empty until production credentials are issued) |
| Server-side env tag | `nz-test` (stamped on every message we store) | `nz-prod` |

Both endpoints forward to the same server-side ingestion route but every message is tagged with which endpoint it came through. Our downstream auto-file logic (still in development — not yet writing to patient records) will filter to `-prod` tags only, so a test message physically cannot end up in a real patient's chart.

**The `-nz` prefix is intentional** — it leaves room for `au-prod` / `au-test` / etc. as Tere expands, without another rename on your side.

Ready for test traffic whenever you are. Let me know if you'd like me to hold off sending real production messages through until you've signed off on the test integration.

Ngā mihi,

Dr Patrick Herling
CMO, Tere Health Limited
HPI-O G11238-E · MCNZ 99529 · HPI-CPN 24NSES
terehealthnz@gmail.com  ·  +64 29 043 234 27
terehealth.co.nz
