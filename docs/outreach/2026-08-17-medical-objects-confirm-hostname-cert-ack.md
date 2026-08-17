**To:** Tony Cruice <helpdesk@medical-objects.com.au>
**Cc:** Paul, Lynden
**Subject:** Re: Case #1058382 — hostname, cert, ACK mode: all live

Hi Tony,

Thanks for the quick turnaround — we've stood the endpoint up already.

1. **Hostname**: production endpoint is live at `hl7.terehealth.co.nz`.

2. **Cert**: public-CA Let's Encrypt cert issued and serving. CN matches the hostname; you can verify:
   ```
   openssl s_client -connect hl7.terehealth.co.nz:443 -servername hl7.terehealth.co.nz
   ```
   (Verify return code: 0. Auto-renewed by acme.sh via Cloudflare DNS-01 inside the container — no manual intervention needed.)

3. **ACK mode**: our `/api/hl7-inbound` handler parses, matches patient/provider, and persists to our store synchronously before returning the HTTP response, so our inline ACK is our final CA / CE / CR — status won't change later. Staying with option (a) inline-only. If we ever move processing behind a queue we'll switch to (b) and let you know.

We've whitelisted the client CN you supplied (`hd.d5ddb385-8b7c-460f-a887-0dcaddf48b0e-guid.id.test.medical-objects.com.au`) and installed the DEMO G3 chain you sent for validation. Ready for Capricorn Cloud test traffic whenever you are — send when convenient and we'll watch for it.

Ngā mihi,
Patrick

Dr Patrick Herling
CMO, Tere Health Limited
HPI-O G11238-E · HPI-CPN 24NSES · MCNZ 99529
Case #1058382
