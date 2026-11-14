# Contributing to Kindwords

Thanks for helping. This guide covers setup, the checks a pull request must pass, the rules the code relies on, and how to report problems.

## Development setup

You need Node 24 and npm. For the container checks you also need Docker with Compose v2.

```bash
git clone https://github.com/AnandSundar/Kindwords.git
cd Kindwords
npm ci
mkdir -p data
DATABASE_URL=file:./data/kindwords.db UPLOADS_DIR=./data/uploads npm run db:migrate
npm run dev
```

Open http://localhost:3000. The setup code prints in the terminal. Use it at `/setup` to create the admin account.

Read the README's Development section for the full list of commands and what each one needs.

## Before you open a pull request

Run these locally. CI runs the same checks.

```bash
npm run lint
npm run typecheck
npm test
npm run widget:size
npm run test:integration
npx playwright install chromium firefox webkit   # once
npm run test:e2e
node scripts/docker-smoke.mjs     # when you change Docker, the entrypoint or startup
```

`test:integration` runs on SQLite and local disk without setup. To cover Postgres and S3, set the `TEST_DATABASE_URL` and `TEST_S3_*` variables listed in the README. CI runs both configurations.

## Hard rules

These rules protect the product's security and privacy. Reviews check them, and a pull request that breaks one will not be merged.

- **No HTML from user text.** Testimonial text, names, roles and everything else a submitter types is shown as plain text. In the app, React escapes it. In the embed, use `textContent`. Lint rejects `innerHTML` and `dangerouslySetInnerHTML`. Do not work around the lint rule.
- **Public surfaces read only through the public read model.** The embed, the wall page and the JSON feed get their data from `src/server/testimonials/public-view.ts`. Do not query testimonial rows for a public response some other way. The read model is the only place that decides what leaves the server, so email addresses and original (pre-edit) text must never reach it.
- **Every admin page and action calls `requireAdmin()`.** Route handlers call `requireAdminRequest()`. Do not rely on middleware alone.
- **Keep the embed under 15 KB gzipped.** `npm run widget:size` fails the build when it is over the limit. Check it before you add a dependency or a large style block to the widget.

## Commit style

Commits are short, imperative, sentence case, with no prefix and no trailing period. Recent examples from the log:

```
Stop clients forging their IP under any start command
Keep what the admin typed when an edit is refused
Run Kindwords with one docker compose up, tested end to end in CI
```

Describe what changes for the user or the maintainer. Keep each commit to one change.

## Branches and pull requests

1. Branch from `main`.
2. Make your change, with tests for new logic.
3. Run the checks above.
4. Open a pull request against `main`. Explain what changed and why, and how you tested it.

CI runs on every pull request and on pushes to `main`. It covers lint, types, unit tests, widget size, integration tests on SQLite and on Postgres with S3, end-to-end tests, and the Docker smoke test.

## Code style

- TypeScript throughout. Run `npm run typecheck`.
- Follow the existing patterns: repository functions for database access, `requireAdmin()` for admin entry points, and the public read model for public output.
- The widget is framework-free TypeScript, built with esbuild. Keep it small.

## Reporting bugs and requesting features

Use the issue templates in `.github/ISSUE_TEMPLATE/`.

- For bugs, include steps to reproduce, what you expected, what happened, and your environment: Kindwords version or commit, how you run it (Docker or Node), the database and storage you chose, your browser if the problem is in the UI, and whether a reverse proxy is in front of it.
- For feature requests, describe the problem first, then the change you would like. Check the roadmap in the README, since some ideas are already planned or ruled out.

Search existing issues before you open a new one.

## Reporting a security issue

Do not open a public issue for a security problem.

Report it privately through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include the affected version or commit, the steps to reproduce, and the impact you expect. The maintainers will reply through that report.

Public issues for security problems expose users before a fix exists. Private reports give maintainers time to fix the problem and publish a release first.
