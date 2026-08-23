# Plan: Connect two-way GitHub sync

## Problem
You pushed commit `2d0b13c` to a GitHub repo ~5 minutes ago, expecting it to land in
this Lovable preview. It did not. Verified root cause:

- `git cat-file -t 2d0b13c` → "Not a valid object name" (the commit is not in this repo).
- `git remote -v` shows only Lovable-internal remotes:
  - `origin` → `git.private.lovable-gcp.code.storage` (Lovable's managed storage)
  - `secondary` → `s3://lovable-repositories/...` (S3 mirror)
- No `github.com` remote exists. There is no path from a GitHub push into this preview.
- `git fetch origin` returned nothing new; Lovable-side history is unchanged since
  the 17:28 UTC "Update plan" commit.

The two-way GitHub connector is not connected to this project, so GitHub pushes have
no bridge into Lovable.

## What you'll do (UI steps — I can't click these for you)
1. Open the **Plus (+) menu** in the chat input (bottom-left of the Lovable editor).
2. Choose **GitHub → Connect project**.
3. Authorize the **Lovable GitHub App** on GitHub when prompted.
4. Select the GitHub account/organization, then **Create Repository** (or pick the
   existing repo if Lovable offers it — note the limitation below).
5. Once connected, the two-way sync runs in real time: edits in Lovable push to
   GitHub, and pushes to GitHub sync back to Lovable.

## Important limitation
Per Lovable's GitHub integration, **directly importing an existing GitHub repository
is not supported**. The flow creates a *new* repo seeded from this project's current
code. To get your `2d0b13c` changes in after connecting, the practical options are:
- Re-apply the same edits in the Lovable editor (I can do this from the diff), or
- After the new repo is created, push `2d0b13c`'s changes onto it from your local
  clone so they sync back in.

Either way, **after** the connector is linked, future GitHub pushes will sync here
automatically.

## What I'll do once you've connected
- Confirm the GitHub remote now appears in `git remote -v`.
- Verify the working tree reflects your intended changes (or re-apply `2d0b13c`'s
  diff if you prefer I do that).
- Read the build log to confirm the preview still compiles cleanly.

## Out of scope
- No schema, RLS, or auth-code changes in this step.
- The pending auth (sign-in / sign-up / forgot-password) optimization plan stays
  on hold until you decide to resume it.
