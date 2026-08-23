# Auth email templates

Dark-mode-safe templates for the six Supabase auth email types. Each type has an
HTML part and a matching `.txt` part — always send both (multipart/alternative),
never HTML only.

| Type | Files |
| --- | --- |
| Sign-in code (OTP) | `magiclink.html` / `.txt` |
| Signup confirmation | `signup.html` / `.txt` |
| Password recovery | `recovery.html` / `.txt` |
| Invite | `invite.html` / `.txt` |
| Email change | `email_change.html` / `.txt` |
| Reauthentication (OTP) | `reauthentication.html` / `.txt` |

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
