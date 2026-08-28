To: Tony Cruice <helpdesk@medical-objects.com.au>
Cc: Medical-Objects Helpdesk
Subject: Re: HL7 v2.1 + v2.4 ACK fixes — Case #1058382

Hi Tony,

Thanks for the detailed walk-through — all three issues confirmed and fixed on our side. Deployed now.

**2.1 ACK — MSH-3**

Fixed: we now emit `MSH-3 = "Tere Health"` and `MSH-4 = G11238-E` (our HPI-O). We were previously echoing incoming MSH-5 into ACK MSH-3, which happens to be a gateway name (`BOPHL7`) in your test path rather than our system name.

**2.1 ACK — MSA-1**

Fixed: single-ack scenario "a" now returns application-level codes throughout:

- success → `AA`
- receiver-not-registered or missing required fields → `AR`
- parse error / auth failure / empty body → `AR`

The `CA` / `CR` mode was left over from earlier planning around scenario "b" (accept-ack + application-ack). We're not doing enhanced mode, so all acks are now `AA`/`AE`/`AR`.

**2.4 ACK — "missing MSH segment" fatal reject**

Root cause: the raw MLLP framing bytes (`<VT>` = 0x0B start-block and `<FS>` = 0x1C end-block) were reaching our parser intact. Our first "segment" started with `\v` rather than `MSH`, so we hit the `startsWith('MSH')` check and rejected the message as malformed. Our normaliser now strips MLLP frame chars, BOM, and leading whitespace before segment split.

**Sample ACK now returned on auth-failure (post-fix, verified live):**

```
MSH|^~\&|Tere Health|G11238-E|UNKNOWN|UNKNOWN|20250101000000||ACK|00000000|P|2.4
MSA|AR|UNKNOWN|Auth failed
```

Please resend a 2.1 and a 2.4 test whenever suits — happy to iterate if anything's still off.

**Rendered message screenshot**

I'll log into our provider dashboard once one of your 2.1 tests lands cleanly and send the screenshot separately — right now the rendered view is empty for those two messages because both were rejected pre-parse.

Cheers,
Patrick
