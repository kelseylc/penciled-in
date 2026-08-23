# Code + UX review: recommended optimizations

I read the real paths: the wizard (`new.tsx`), respond flow (`p.$slug.tsx` + `respond.functions.ts`), solver (`solver.ts`), results/lock (`results.functions.ts`), occurrences, groups, and the DB indexes. The model is sound and the solver is genuinely well-factored (pure, tested, unknown never coerced to "no"). Below are the issues worth fixing, ranked. Nothing here is built yet — approve the ones you want.

## Tier 1 — correctness and data-loss risks

**1. Guest response saving is destructive.** `submitResponses` deletes every row for the participant, then re-inserts. If the insert fails (network blip mid-request, validation), the person's prior answers are gone. There is already a unique index on `(participant_id, candidate_slot_id)`, so this should be an `upsert` plus a targeted delete of only the slots that went back to "unknown".

**2. Nothing is transactional.** `createProject` does three sequential inserts (project → participants → slots); `lockOneOff` / `lockCadence` do delete-then-insert on `decisions` and `occurrences`. A failure between steps leaves a project with no slots, or a locked project with no occurrences. Move each of these into a single Postgres function called via RPC so it commits or rolls back as one unit.

**3. Duplicate-participant race in `joinProject`.** Two people typing the same name at once both miss the `ilike` check and both get rows. Add a unique index on `(project_id, lower(display_name))` for unclaimed participants and handle the conflict.

**4. Public endpoints have no abuse ceiling.** `getRespondBundle`, `joinProject`, `submitResponses`, and especially `parsePlan` (which calls the AI model) run unauthenticated with the service-role key and no rate limit. `parsePlan` is a metered cost anyone can loop. Add a lightweight per-IP + per-project limiter, and cap `parsePlan` hardest.

**5. The respond screen ignores deadline and status.** `p.$slug.tsx` never reads `response_deadline` or `project.status`, even though the bundle returns both. Someone can still submit answers to a poll that is already locked, and the response silently never affects anything. Needs a "this plan is locked — here's the decision" state and a past-deadline state.

## Tier 2 — architecture

**6. Every read is a POST server function called from `useQuery`.** Public pages (`/p/`, `/results/`, `/d/`) render an empty shell first, then fetch. Moving these to route loaders with `ensureQueryData` gives server-rendered first paint on the two links you actually share — a real perceived-speed win on the mobile cold open the whole product is built around.

**7. `new.tsx` is an 825-line component with ~22 `useState` hooks.** Every keystroke re-renders the whole wizard including slot generation. Split into a step reducer plus one component per step, and memoize generation. Same file also loses everything on refresh — persist the draft to `sessionStorage`.

**8. Timezone grouping/labelling is reimplemented in four files.** `p.$slug`, `results.$slug`, `d.$slug`, and `o.$id` each rebuild "group slots by local day, format label, detect weekend". One `lib/time.ts` module.

**9. `getResults` returns full response matrix to the client.** Fine at current caps (200 slots × 100 people = 20k entries worst case, ~1MB JSON). Add a server-side pre-tally so the payload is per-slot counts plus names, not raw rows.

## Tier 3 — UX

**10. The home page promises what it can't deliver.** Anyone can type a plan into the AI box, but `/new` immediately redirects to `/auth` if there's no session — the natural-language draft survives, yet the user hits a signup wall after doing the fun part. Either let the wizard run unauthenticated and ask for the account only at "Create & get link" (better), or say "sign in to organize" up front.

**11. Saying "no" costs three taps.** The cycle is unknown → yes → maybe → no. For most people the common answers are yes and no; maybe is the rare one. Consider long-press or a swipe for direct "no", or reorder to unknown → yes → no → maybe.

**12. No autosave on the grid.** A respondent can tap 40 slots and lose all of it by closing the tab before Confirm. Debounced save-as-you-go (the upsert from item 1 makes this cheap) plus a local draft would honor the "under 30 seconds, never lose work" principle.

**13. The timezone changer is a raw native `<select>` of ~400 IANA strings.** Replace with a searchable list of the few zones already present in the group plus a search field.

**14. Desktop is a phone column.** Every route is `max-w-md`. Mobile-first is right for responders, but the organizer screens (`/results`, `/home`, `/groups`, the review step) are laptop work — they should widen to a two-column layout above `md` without touching the respond flow.

**15. Bulk tools are weekday/weekend only.** On a 4-week window that's still a lot of tapping. Add "all mornings/evenings", per-day-row set-all, and an undo on bulk actions.

## Technical notes

- Indexes are in good shape; no missing index found for the current query set. The one to add is the uniqueness constraint in item 3.
- `enumerateCadences` recomputes modal answers per (weekday, time) pair on every render path that calls it; memoize on `[slots, responses, quorum, cadence]` at the call site.
- `lockCadence` derives `cadence_start_time_utc` from `getUTC*` of the first occurrence, so a cadence spanning a DST change drifts by an hour in the stored decision even though individual occurrence rows are correct. Store the IANA zone + local time instead.
- `/test` is correctly `noindex`. No route sets `og:image`; once there's a share image, add it to `/` and `/p/$slug` leaves only.

## Suggested order

Tier 1 items 1, 3, 5 are small and remove real data/correctness bugs. Item 2 (transactions) and item 4 (rate limits) are the next block. Item 10 is the biggest single UX unlock. The rest can follow incrementally.
