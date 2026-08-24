# Plan: Fix the timezone label on Step 4 (People)

## What's actually happening today

Verified in the code:

- When you add someone on Step 4, `new.tsx` assigns them your own detected timezone
  (`America/New_York`) as a placeholder, and the list row prints that raw IANA string
  under their name.
- When the invitee opens the link, `p.$slug.tsx` auto-detects their real timezone and
  can change it from a picker at the top of the respond screen. Both `joinProject` and
  `submitResponses` write that value back to their participant row.

So the invitee **does** relabel themselves — the Step 4 value is overwritten the moment
they respond. The problem is purely UX: we're showing a confident, wrong-looking fact
that the organizer can't correct and doesn't need to.

Note: participant timezone is display metadata only. Slots are generated in the
organizer's timezone and stored in UTC; the solver and results don't read participant
timezones. The "N timezones in this group" expander on the decision screen does.

## Recommendation

Don't ask organizers to be a timezone data-entry clerk. Best practice here is
**self-declaration with an optional organizer hint**:

1. **Stop asserting a timezone that isn't theirs.** New people show
   "Timezone set when they respond" instead of `America/New_York`. Honest, and it
   teaches the model in one line.
2. **Keep a lightweight override for people the organizer knows are elsewhere.**
   A small "Set timezone" link on each row opens a searchable timezone picker
   (city-style labels, e.g. "London — GMT+1", not raw IANA). Chosen values render as a
   friendly label with a subtle "you set this" hint.
3. **Show real values when we have them.** People pulled from a saved group already
   have a confirmed timezone; those rows display it normally, since it came from the
   person, not a guess.
4. **Invitee still wins.** Whatever the invitee picks on the respond screen overwrites
   the organizer's guess. Add one line on the respond screen's timezone control:
   "Times shown in <zone> — change if that's not right", so the correction is obvious.

Why not force the organizer to set everyone's zone: it's slow, usually unknown, and
already self-corrects — it would violate the "responding takes under 30 seconds" and
"the organizer does the least work" spirit of the app.

## Technical changes

- `src/routes/new.tsx`: give each person an optional `timezone` (null by default rather
  than the organizer's `tz`); render the placeholder copy vs. friendly label; add a
  per-row timezone picker sheet using `Intl.supportedValuesOf("timeZone")` with a search
  filter and offset labels; on submit send `p.timezone ?? tz` so the payload stays valid
  against the existing schema.
- Shared helper for friendly zone labels (city + current UTC offset), reused by the
  respond screen so labeling is consistent.
- `src/routes/p.$slug.tsx`: minor copy nudge on the existing timezone select.
- No schema, RLS, or server-function changes. `participants.timezone` already holds this.

## Out of scope

- Per-participant time rendering in the organizer's slot review (slots stay in the
  organizer's zone).
- Editing a participant's timezone after the plan is created.
