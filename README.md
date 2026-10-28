# Run Deck

Labs post agent tasks and their recorded runs. Each task is a deck (instruction, grading, blockers, results, failure modes, write-ups) and every run plays step by step. Each lab sees only its own tasks and people; the site admin sees every lab.

Built with Next.js for Cloudflare Workers: a D1 database for labs, people and tasks, and an R2 bucket for screenshots and steps. Locally, both are emulated in `.wrangler/`.

## Run it locally

```bash
npm install
npm run db:migrate     # create the local database tables
npm run build:data     # optional: rebuild data/build/ from data/ and ../stepwise_upload_with_duration
npm run seed           # load data/build/ into the local database and bucket as the "MSL" lab
npm run preview        # build for Cloudflare and serve it in the Workers runtime at http://localhost:3100
```

For day-to-day work, `npm run dev` runs the Next.js dev server on port 3100 with the same local database and bucket.

The first time, open `/setup` to create the admin account. From `/admin`, create labs and invite links; each link creates one account in one lab and expires after 7 days.

`npm run seed -- --lab-slug other --lab-name "Other lab"` loads the same build into a different lab.

To try things without touching your local data, copy `.wrangler/state/v3` somewhere and start the dev server with `RUN_DECK_STATE=<that folder> npm run dev`.

## Uploading tasks

Lab members upload from their lab's page (**Upload tasks**). The page offers a packaging prompt to paste into an LLM, which builds the package from the lab's own recordings: computer-use runs with screenshots, command-line runs with each command's output, or tool / API runs with each call's result. The prompt and its checker are in `public/tools/`.

- The browser opens and checks the package (the same rules as `public/tools/check_package.py`) before anything is sent.
- Only screenshots the lab doesn't already have are sent, in batches; the server checks each one's content against its name.
- New tasks arrive as drafts that only the lab can see; anyone in the lab can publish them. Lab owners and the site admin can delete tasks.
- A task folder the lab already has replaces that task: the new version goes live in one step, keeping the task's status, and the old version's steps and unused screenshots are removed.

## Running the site

- **Site admin** (`/admin`): totals and anything needing attention; every lab with its settings, people, invites, tasks, storage and activity; all people (change roles, turn accounts off, make password reset links, remove); all tasks; a readable activity log; and storage, with a clean-up for abandoned uploads and screenshots no task uses.
- **Lab owners** (`/labs/<lab>/people`): invite people to their own lab, revoke invites, and turn members off. Members see who is in their lab.
- **Everyone** (`/account`): change their name and password, and sign out of other devices.
- There is no email: invite and password reset links are shown once and passed on by whoever made them. Reset links work once, within a day.

## Sharing with reviewers

Lab owners and the site admin make share links from the lab's **Sharing** page (`/labs/<lab>/sharing`). A link opens `/v/<token>`: the lab's overview, decks and players, read-only, with no account and no sidebar.

- A link shows every published task (including ones published later) or only chosen tasks. Drafts are never shared, and unpublishing a task removes it from every link.
- Links can expire after 7, 30 or 90 days, and can be revoked at once. Pausing the lab stops all of its links too. The Sharing page counts views.
- Everything is checked against the link, down to each screenshot: a link can't reach tasks, steps or screenshots outside it.
- The scores sheet under a link offers live import into Google Sheets: `=IMPORTDATA("<site>/api/v/<token>/sheet.csv?tab=summary")` (or `tasks`, `runs`). It works once the site has a public address, and stops when the link does.
- Shared pages ask search engines not to index them and don't send the link to sites they open.

## Deploy to Cloudflare

Use a Workers Paid plan: signing in and rendering pages need more CPU time per request than the free plan allows.

```bash
npx wrangler login
npx wrangler d1 create run-deck            # put the printed database_id in wrangler.jsonc
npx wrangler r2 bucket create run-deck-data
npm run db:migrate:remote
npx wrangler secret put ADMIN_SETUP_TOKEN  # any long random string; /setup asks for it
npm run deploy
```

Then open `/setup` on the deployed site, enter the token, and create the admin account.

## Where things are

- `src/app`: pages, server actions (`actions.ts` for accounts and tasks, `admin/actions.ts` for labs, people and invites), and the steps, screenshot and upload endpoints under `api/`
- `src/lib/package`: reading, checking and uploading task packages in the browser
- `src/lib/server`: sign-in and sessions, database reads (always filtered by the signed-in user's lab), bucket keys
- `migrations/`: database schema
- `data/`: source recordings (`index.json`, `runs/`) and the generated `build/`; nothing here is served directly
- `scripts/build-deck.mjs`, `scripts/seed-local.mjs`: build and load task data
- `.backup/`: the code of the single-lab version, before accounts were added
