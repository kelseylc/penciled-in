# Auth email templates

Dark-mode-safe templates for the Supabase auth emails this project can actually
send. Each type has an HTML part and a matching `.txt` part — always send both
(multipart/alternative), never HTML only.

| Type | Files | Sent when |
| --- | --- | --- |
| Signup confirmation | `signup.html` / `.txt` | someone creates an account |
| Password recovery | `recovery.html` / `.txt` | someone asks to reset their password |
| Invite | `invite.html` / `.txt` | an admin invites a user from the Supabase dashboard |
| Email change | `email_change.html` / `.txt` | a user changes the address on their account |

The first two are triggered by the app. The last two are not: no code path
reaches them today, and they are kept because the dashboard can send them
without any app code.

Magic-link and reauthentication templates used to live here. Nothing could
reach them — the app has no `signInWithOtp` or `reauthenticate` call, and
magic-link sign-in was considered and turned down — so they were removed
rather than left to rot. They are in git history if that decision changes.

## Rules these follow (keep them when editing)

- Inline styles only. No `<style>` blocks, no classes, no external stylesheets.
- Table-based layout. Buttons are a `<table>` with `bgcolor` **and** inline
  `background-color` on the `<td>` — never a styled `<div>` or bare `<a>`.
- Every template carries:
  ```html
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  ```
- Never `#FFFFFF` or `#000000` — Apple Mail inverts those hardest. Use `#FFFDF9`
  (surface), `#FAF7F2` (page), `#2B2622` (ink), `#5C5349` (body), `#8A8079`
  (muted), `#C4633F` (brand button).
- The code or URL is always repeated as plain, selectable text below the button.

## Activating them

Custom auth templates go live once a sender domain is configured for the
project; the platform then owns delivery, retries, and rate limits. Do not point
auth email at Supabase's built-in SMTP — its handful-of-sends-per-hour cap fails
silently and looks identical to a template bug.
