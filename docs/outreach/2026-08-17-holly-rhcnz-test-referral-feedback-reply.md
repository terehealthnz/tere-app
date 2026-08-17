**To:** Holly Johnson <Holly.Johnson@rhcnz.com>
**Cc:** Jesse Thorpe <jesse.thorpe@rhcnz.com>
**From:** terehealthnz@gmail.com
**Subject:** Re: RHCNZ test referral — fixes shipped for the 3 items you flagged

Kia ora Holly,

Great to hear it landed in your RIS cleanly — thank you for the specific feedback, all three items now fixed and deployed on our side:

1. **Referral ID** — will populate with the generated referral UUID going forward. We were setting it post-insert so the first PDF rendered with a blank field; now it's generated up-front and shared between the PDF, our audit row, and the email so all three carry the same reference.

2. **Referral Sent date/time** — that was my machine's timezone leaking in (I'm currently on Pacific coast time). We've hard-coded NZ time on the timestamp so the PDF will always render Pacific/Auckland regardless of who's running the server.

3. **File size ≥ 10 KB** — good catch, first time anyone's asked for a *bigger* PDF! We've added our Tere Health logo to the header on referral PDFs (it looks better anyway) which pushes the file well past 10 KB. Should hit your automation cleanly from here on.

**On Practice Dispatch / MO routing ID** — thanks, that'll be genuinely useful when it comes through from Medical-Objects. Happy to swap `G11238-E` for the full routing ID as soon as you send it; the field renders in section 5 of the referral so it'll be immediately visible to your team.

Nothing further needed on my end unless the next real referral hits any snags. Really appreciate you taking the time to run this end-to-end — makes the launch much smoother.

Ngā mihi,

Dr Patrick Herling
CMO, Tere Health Limited
HPI-O G11238-E · MCNZ 99529 · HPI-CPN 24NSES
terehealthnz@gmail.com · terehealth.co.nz
