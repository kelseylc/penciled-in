# Group Sync

I'm building a group scheduling web app called Adulting is Hard. I'm going to give you the full context now, then build it with you in numbered steps. For this message, don't write any code — just confirm you understand the model.

What it is

Groups of adults in their late 30s/40s — full-time jobs, kids, scattered timezones — can't find a time to be in the same place. Existing tools (Doodle, When2Meet, Rallly) fail not because there's no overlap, but because respondents never open the link. This app optimizes ruthlessly for the respondent, not the organizer.

The flagship use case is a D&D group finding a recurring session slot, then confirming attendance each session. Secondary use cases are one-off brunches, lunches, movie nights.

Non-negotiable principles

Responding takes under 30 seconds. Every design decision bends to this.

No account required to respond. Ever. A guest opens a link, types their name, answers, done.

The group is durable; events are cheap. Reuse people and settings across events.

Ship a decision, not a heatmap. The app names dates and ranks them.

Good enough beats everyone. Quorum, not unanimity.

Mobile-first. Assume a phone in one hand. Must also work on desktop web, but design for mobile first — thumb-reachable controls, no hover-dependent UI, no drag gestures, minimum 44px tap targets.

Core objects

Group — a persistent named set of people ("The Thursday Table"). Reused across events.

Project — one scheduling effort ("Session 12", "Birthday brunch"). Belongs to a group or is ad-hoc. Either one-off or recurring.

Participant — a person in a project. Flagged required or optional. Has a unique invite token. No account needed.

Quorum — organizer-set minimum headcount for a slot to be viable.

Occurrence — a single dated instance of a recurring project (e.g. "Session 12 on Nov 9"). Has its own attendance confirmation.

Availability is three-state

yes / maybe ("if I have to") / no. Non-response is a fourth, distinct state — unknown — and is never treated as no.

Recurring works in two phases — this is the most important thing in the app

Phase 1 — Find the cadence (hard, done rarely). Solve for the best recurring weekday + start time across the next N occurrences. Lock it once.

Phase 2 — Confirm each occurrence (easy, done every session). Each upcoming occurrence gets a one-tap confirm: In / Out / Late. If confirmations fall below quorum, the app surfaces a "Re-poll this session" action that spawns a one-off project scoped to ±7 days around that occurrence — without disturbing the locked cadence. The cadence survives; only that session moves.

Most scheduling tools only build Phase 1. Phase 2 is where the real weekly pain lives. Build both.

Timezones are structural, not cosmetic

Participants are genuinely scattered (US West Coast, US East Coast, occasionally London).

Store every timestamp in UTC, always, in timestamptz.

Every participant record has an IANA timezone string (e.g. America/New_York), auto-detected via Intl.DateTimeFormat().resolvedOptions().timeZone, editable by them.

Always render times in the viewer's own timezone, with the abbreviation shown (e.g. "Sun Nov 9, 2:00 PM EST").

On any screen showing a decided or proposed time to a group, show a small "3 timezones in this group" indicator that expands to show the same slot in each participant's local time.

Use date-fns-tz or Luxon. Never do manual offset arithmetic. Never store local times.

Explicitly OUT of scope for v1 — do not build these

Google/Outlook/Apple calendar OAuth or sync. Screenshot parsing. Native mobile apps. Push notifications. In-app chat. Venue or location voting. Payments or cost-splitting. SMS. Public event discovery pages. Voice input (this is planned for v2 — leave a placeholder button that says "Voice input coming soon", disabled).

Confirm you've understood, then wait for Step 1.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://penciled-in.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/057eec39-4362-49f7-b42a-04810d1cb105).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
