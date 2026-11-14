# Kindwords

Kindwords is a free, self-hostable testimonial wall. Customers send testimonials through a public form for each product, you approve them in an inbox, and the approved ones appear on any website with one script tag. It runs with one `docker compose up`.

The clone URLs below use the placeholder `OWNER/kindwords`. Replace it with the real repository path.

## Features

- A public collection form for each space: name, email, role or company, optional photo, 1–5 star rating, text, and a consent checkbox that must be ticked. Email is never shown publicly. Spam protection is a hidden honeypot field and per-client rate limiting. There is no CAPTCHA.
- A moderation inbox: approve, reject, edit (the original text is kept and only the admin sees it), feature, delete, or add a testimonial by hand.
- An embed that renders inside a Shadow DOM, so the host page's CSS does not restyle it. Masonry layout, light, dark or auto theme, under 15 KB gzipped.
- An iframe wall page for each space, which also works as a link to share.
- A public JSON feed of approved testimonials.
- SQLite or Postgres for data. Photos on local disk or in any S3-compatible storage.

## Quick start

```bash
git clone https://github.com/OWNER/kindwords.git
cd kindwords
cp .env.example .env
docker compose up -d
```

Then:

1. Find the setup code: `docker compose logs kindwords`. Look for the line `Kindwords setup code: ...`. The code is printed only while no admin account exists.
2. Open http://localhost:3000/setup, enter the setup code, and create the admin account.
3. In the admin, create a space. Make one space per product.
4. Share the space's collection link (`/c/...`) with customers.

The host port is 3000 by default. Change it with `KINDWORDS_PORT` in `.env`. Before you share any links, set `PUBLIC_URL` in `.env` to the address people use (see [Configuration](#configuration)).

## Embedding a wall

The admin page for each space shows the embed code, with your public address filled in. The script tag is:

```html
<script src="https://reviews.example.com/embed.js" data-space="SPACE_ID" async></script>
```

The wall appears where the tag is. Attributes:

| Attribute | Required | Meaning |
|-----------|----------|---------|
| `data-space` | yes | The space's public ID, as shown in its embed code |
| `data-theme` | no | `light`, `dark` or `auto` (the default). `auto` follows the visitor's system setting |
| `data-featured` | no | Add it with no value to show only featured testimonials. `data-featured="false"` turns this off |

To change the font, set the `--kindwords-font` CSS custom property on your page. The widget does not load fonts itself, so load a web font on your page and name it here:

```css
:root {
  --kindwords-font: Georgia, serif;
}
```

**Iframe fallback.** Each space also has a wall page, `https://reviews.example.com/w/SPACE_ID`, which you can link to or embed:

```html
<iframe src="https://reviews.example.com/w/SPACE_ID?theme=dark&featured=1" title="Testimonials" loading="lazy" style="width:100%;height:600px;border:0"></iframe>
```

- `theme` accepts `light` or `dark`. Any other value means `auto`.
- `featured=1` shows only featured testimonials.
- The iframe height is fixed, so the wall scrolls inside it.

**JSON feed.** `https://reviews.example.com/api/public/SPACE_ID/testimonials` returns approved testimonials as JSON. Add `?featured=1` to limit it to featured ones. The response is readable from any site without credentials.

```json
{
  "version": 1,
  "testimonials": [
    {
      "name": "Ann Example",
      "roleCompany": "Designer, Example Co",
      "rating": 5,
      "text": "Setup took ten minutes.",
      "avatarUrl": "https://reviews.example.com/media/KEY",
      "featured": false,
      "createdAt": "2026-11-01T12:00:00.000Z"
    }
  ]
}
```

`rating`, `roleCompany` and `avatarUrl` can be `null`. `avatarUrl` is absolute when `PUBLIC_URL` is set. Otherwise it is a path to resolve against the feed's address. Featured testimonials come first, then newest first.

Only approved testimonials are ever public. Email addresses are never included in any public surface, and neither is the original text of an edited testimonial.

## Configuration

Copy `.env.example` to `.env` and edit it. Every setting is optional. The defaults run a single-machine install.

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_URL` | unset (uses the request address) | The address people use to reach Kindwords, with no trailing slash. Set it in production |
| `KINDWORDS_PORT` | `3000` | Host port for `docker compose up`. The container always listens on 3000 |
| `TRUSTED_PROXY_COUNT` | `0` | Number of reverse proxies in front of Kindwords (see [Behind a reverse proxy](#behind-a-reverse-proxy)) |
| `DATABASE_URL` | `file:/data/kindwords.db` | `file:` path for SQLite, or `postgres://` or `postgresql://` URL for Postgres |
| `STORAGE_DRIVER` | `local` | `local` for disk, or `s3` for an S3-compatible store |
| `UPLOADS_DIR` | `/data/uploads` | Photo folder when `STORAGE_DRIVER=local` |
| `S3_BUCKET` | none | Bucket name. Required when `STORAGE_DRIVER=s3` |
| `S3_REGION` | `us-east-1` | Bucket region |
| `S3_ENDPOINT` | unset (the AWS default) | Endpoint URL for other S3-compatible stores such as MinIO or Cloudflare R2 |
| `S3_ACCESS_KEY_ID` | unset | Access key. Set it together with `S3_SECRET_ACCESS_KEY`, or leave both unset |
| `S3_SECRET_ACCESS_KEY` | unset | Secret key. Set it together with `S3_ACCESS_KEY_ID`, or leave both unset |

### Why `PUBLIC_URL` matters

Set it to the address people use, and use `https://` in production. Kindwords uses it for:

- **Share links and embed code.** The collection link, wall link and script tag are built from it.
- **Absolute photo URLs** in the JSON feed.
- **The Secure cookie.** The login cookie is marked `Secure` only when `PUBLIC_URL` starts with `https://`. Plain-HTTP installs on a local network can still log in.

## Behind a reverse proxy

Set `TRUSTED_PROXY_COUNT` to the number of proxies between the internet and Kindwords. One nginx or Caddy means `1`. Leave it at `0` only when clients connect directly.

A wrong value has two bad effects. If it is too high, clients can fake their IP address. If it is `0` behind a proxy, every visitor appears as the proxy and they share one rate-limit bucket.

The proxy must also forward the original `Host` header. Without `PUBLIC_URL`, Kindwords builds links from `Host` and refuses form posts whose `Origin` does not match it. Caddy forwards it by default. nginx needs the header set explicitly.

Caddy (with `PUBLIC_URL=https://reviews.example.com` and `TRUSTED_PROXY_COUNT=1`):

```
reviews.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx (TLS settings omitted):

```nginx
server {
    server_name reviews.example.com;
    # Photos are up to 2 MB. nginx's default limit of 1 MB would refuse larger uploads.
    client_max_body_size 3m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Choose your database and storage at install

The defaults are a SQLite file and local photos, both in the `kindwords-data` volume. Postgres and S3 are optional settings in `.env`.

Kindwords has no tool to move data between SQLite and Postgres, or between local disk and S3. Choose before you collect any data.

Postgres:

```
DATABASE_URL=postgres://kindwords:PASSWORD@db.example.com:5432/kindwords
```

`docker-compose.yml` does not start a database. Point `DATABASE_URL` at a Postgres server you run.

S3-compatible storage:

```
STORAGE_DRIVER=s3
S3_BUCKET=kindwords
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.example.com
S3_ACCESS_KEY_ID=YOUR_KEY_ID
S3_SECRET_ACCESS_KEY=YOUR_SECRET
```

The bucket does not need to be public. Kindwords streams photos itself, at `/media/...`.

## Backups

The `kindwords-data` volume holds the SQLite file (`kindwords.db`) and local photos. Docker Compose names the volume `<folder>_kindwords-data`, where the folder name is the project name by default. Back up that volume. Stop the container first so the SQLite file is not written during the copy.

If you use Postgres or S3, back up that database or bucket instead.

## Reset the admin password

```bash
docker compose exec -it kindwords reset-password
```

Type the new password at the prompt. The command signs out every session, including yours.

## Development

Requires Node 24 and npm.

```bash
npm ci
mkdir -p data
DATABASE_URL=file:./data/kindwords.db UPLOADS_DIR=./data/uploads npm run db:migrate
npm run dev
```

The commands above use POSIX shell syntax. In PowerShell, set `$env:DATABASE_URL` and `$env:UPLOADS_DIR` first.

`npm run dev` builds the embed script and starts the Next.js dev server at http://localhost:3000. It reads `.env`, so put the same two values there too. The setup code prints in the terminal, and the setup steps are the same as in the quick start.

Checks:

| Command | What it runs | Needs |
|---------|--------------|-------|
| `npm run lint` | ESLint. Bans `innerHTML` and `dangerouslySetInnerHTML` | Nothing |
| `npm run typecheck` | TypeScript, no emit | Nothing |
| `npm test` | Unit tests | Nothing |
| `npm run test:integration` | Repository, auth, public feed and storage tests | Nothing for SQLite and local disk. Optional: `TEST_DATABASE_URL` for Postgres, and `TEST_S3_ENDPOINT`, `TEST_S3_BUCKET`, `TEST_S3_ACCESS_KEY_ID`, `TEST_S3_SECRET_ACCESS_KEY`, `TEST_S3_REGION` for S3 |
| `npm run widget:size` | Builds the embed and fails above 15 KB gzipped | Nothing |
| `npm run test:e2e` | Playwright tests in Chromium, Firefox and WebKit against a production build | Run `npx playwright install chromium firefox webkit` first |
| `node scripts/docker-smoke.mjs` | Full Docker check: setup, submission, restart, password reset | Docker. Uses the Compose project `kindwords-smoke` and removes its volumes when done |

## Roadmap

Planned or deferred, not in v1:

- Video testimonials
- Importing testimonials from X or G2
- CSV import
- Carousel layout
- Multiple users and teams
- Email notifications and email-based password reset
- A tool to move data between SQLite and Postgres, or between local disk and S3
- A per-space list of websites allowed to load the feed and wall page

Not planned: billing or hosted plans, AI summaries or rewriting of testimonials, and reviews or surveys beyond testimonials.

## Security

Report vulnerabilities privately. See [Reporting a security issue](CONTRIBUTING.md#reporting-a-security-issue).

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
