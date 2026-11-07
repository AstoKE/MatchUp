# Operations runbook (pilot)

Phase 7 M7. This is for whoever runs the pilot day to day. Today that is one person, the founder (risk R-9).

Everything here is done in the web console at `/admin` (*Profil › Yönetim*). That needs an administrator row and TOTP (DEPLOYMENT §11). A few things are done in the Supabase dashboard, and those are marked. Every console decision asks for confirmation once and is written to the audit record (*Kayıt*).

Rules that hold everywhere:
- **People decide; nothing is automatic.** No flag or report count suspends anyone (PHASE6_PLAN §4).
- **Tell the person nothing about the reporter.** Reports are anonymous to the person reported.
- **Write a short, factual note** with every decision. Notes are personal data; their retention is a counsel question (SECURITY §8). No opinions about the person, no health or other special-category data.
- **Never use the service-role key outside the dashboard,** and never paste user data into chats, tickets or AI tools.

## 1. Daily routine (about 15 minutes)

1. **Support inbox** (`brand.contact.supportEmail`, DEPLOYMENT §14 step 6): answer within **2 working days**.
   - A suspended person asking why gets a short, neutral answer. Do not argue the evidence; see §3 for an appeal.
   - Requests to delete or export data: the person can do both in the app (*Ayarlar › Hesap*). Point them there. If they cannot sign in, see §5.
2. ***Bildirimler* (reports):** triage every open report **within 24 hours** (SECURITY §5). See §2.
3. ***İşaretler* (flags):** look at new flags. See §4.
4. ***İtirazlar* (attendance disputes):** decide each one within 48 hours, before the review window closes.
5. ***Mekânlar* (venue queue):** verify or hide new suggestions. See §4.
6. ***Pilot*:** glance at the numbers. A sudden jump in sign-ups or reports is the first sign of abuse (§6).
7. **Health monitor and error reports** (DEPLOYMENT §13): read any alert email or new error group.

## 2. Reports

Open the report. It shows the reason, the reporter's note (if any), the target, and how many other open reports the target has.

| What you see | Do |
|---|---|
| Not a rule break (disagreement, a lost game, a mistaken report) | **Close: dismissed** |
| A real but minor issue (one rude message, a sloppy event) | **Close: actioned**, note what you saw. No suspension for a first minor case |
| A fake or dangerous event | **Cancel the event and close.** Participants are told the event is canceled |
| Harassment, threats, spam accounts, repeated breaks, or someone under 18 | **Suspend and close** (§3) |
| A threat to someone's life or safety | Suspend, then tell the reporter to contact **112**. We are not an emergency service |

Several reports about the same target are one case: decide them together.

## 3. Suspending and reinstating

- **Suspend** in *Kişiler*: search the person, open them, **Askıya al**, and write the reason in the note.
  - The person can still sign in, but sees only the suspended page with the support address.
  - The server refuses every write.
  - Their upcoming events stay. Cancel them separately if they are fake or unsafe.
- An administrator cannot be suspended. Revoke the administrator row first (DEPLOYMENT §11).
- **Appeal:** if the person writes in with something new, look again. If you suspended them yourself, ideally ask a second person.
- **Reinstate** in *Kişiler* with **Geri aç**. Note why.
- Under 18: suspend. Then ask counsel what must be deleted and when (SECURITY §8). Do not ask the person for an ID document.

## 4. Flags, reviews and venues

- **Flags** are hints, not verdicts:
  - mutual top ratings between two accounts;
  - a burst of low ratings against one person;
  - three no-shows in 30 days.

  Look at the history in *Kişiler*. Hide a review that is clearly retaliation or collusion. Otherwise close the flag with a note.
- **Hidden reviews** stop counting toward ratings. They can be restored if hidden by mistake.
- **Venues:**
  - **Verify** a suggestion only if the place exists, its pin is right, and the name is not an advert.
  - **Hide** duplicates, private homes and joke entries.
  - A new account may suggest one venue a day.

## 5. Account deletion and data requests

- **In the app:** deletion has a 30-day grace period, and the person can cancel it. A daily job purges after that (ADR-0017). Export is a JSON file, once a day.
- **The person cannot sign in:**
  - Ask them to reset their password first.
  - If that is impossible (they lost the mailbox), do not act on an email alone. Ask counsel how identity must be verified before deleting by hand (SECURITY §8).
- **A KVKK request in writing** (information, correction, deletion, objection): the legal answer period is 30 days. Forward it to counsel the same day.

## 6. When things go wrong

**A wave of spam or fake accounts:**
1. Close sign-up (DEPLOYMENT §14, "To close sign-up again"). Existing users are not affected.
2. Tighten the quotas in the SQL editor of the dashboard. The change takes effect on the next request, with no release. For example:
   ```sql
   update public.app_config set value = '1'::jsonb where key = 'quota.new_account_max_events_per_day';
   update public.app_config set value = '14'::jsonb where key = 'quota.new_account_days';
   update public.app_config set value = '5'::jsonb where key = 'quota.max_open_requests';
   ```
3. Suspend the accounts, then close their reports.
4. Check the CAPTCHA and rate limits (DEPLOYMENT §12, §14 step 5). Then reopen sign-up.

**The service is down** (monitor alert):
1. Check status.supabase.com and the project's dashboard.
2. If it is our fault (a migration or a release), roll forward with a fix. Never edit an applied migration.
3. Keep a short timeline: when it was noticed, what was done, when it recovered.

**Suspected data breach** (a leaked key, data seen by the wrong person, a stolen admin account):
1. Contain it:
   - rotate the affected keys (*Project Settings → API keys*);
   - revoke the administrator;
   - sign the account out (*Authentication → Users → … → Sign out*).
2. Write down what happened and when, as it happens. Do not delete evidence.
3. **The same day, contact counsel.** KVKK requires notifying the Authority within **72 hours** of learning of a breach, and informing the people affected (SECURITY §8 item 11). Counsel decides the wording.

**A bad release on the web:** redeploy the previous build from the web host. Mobile builds cannot be recalled. For them, `min_supported_app_version` in `app_config` is the lever once it is enforced.

## 7. Who and how fast

| What | Target | Owner |
|---|---|---|
| Report triage | 24 h | founder |
| Attendance disputes | 48 h | founder |
| Support email | 2 working days | founder |
| KVKK request | forwarded same day, answered in 30 days | founder + counsel |
| Breach | counsel same day, Authority within 72 h | founder + counsel |

When the founder is away for more than a day, close sign-up, or name a second administrator with TOTP beforehand (DEPLOYMENT §11).
