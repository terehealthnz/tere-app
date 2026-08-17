**To:** Tony Cruice <helpdesk@medical-objects.com.au>
**Cc:** (leave blank)
**Subject:** Re: Case #1058382 — Tere Health receive endpoint: server hostname, cert & ACK mode

Hi Tony,

Thanks for the endpoint details and the G3 chain — both received and the chain verifies clean against your intermediate.

We're standing up the mTLS termination in Sydney (Fly.io) and are ready to lock in the test round-trip, but three things aren't clear from the notes so far. Would appreciate a quick reply on each:

**1. Server hostname on our side.** What hostname will Capricorn Cloud POST to when sending us the test messages? We'd like to publish `hl7.tere.co.nz` if you don't have a preference — happy to use whatever you'd prefer to see in the SAN.

**2. Server cert requirement.** For the test network, does our server cert need to be issued by a public CA (Let's Encrypt / DigiCert), or will Capricorn accept a self-signed cert we hand you the fingerprint for? Public-CA is fine on our side if that's the norm.

**3. ACK mode.** Your 21:25 note gave `https://hd-d5ddb385-...-guid.test.medical-objects.com.au` as the URL "for supplying return acknowledgements." Just want to confirm — is the expected pattern:

- **(a)** Inline ACK — Capricorn POSTs the message, we respond `200 OK` with the ACK as the HTTP response body (MSH+MSA); or
- **(b)** Async ACK — we accept the message, return `200 OK` with an empty body, then POST the ACK to that URL separately?

Our current handler does (a). Happy to add (b) if that's what your test harness expects.

Once we've got those three, we can deploy and run the Postman collection end-to-end within a day.

MSH-6 variants (`DEMO Tere Heal (G11238-E)`, `DEMO Tere Health (G11238-E)`, `G11238-E`) are already accepted at our org-level matcher, and MSA-1 CA/CE/CR values are handled by the parser.

Kind regards,
Patrick

Dr Patrick Herling
CMO, Tere Health Limited
HPI-O G11238-E · HPI-CPN 24NSES · MCNZ 99529
