# Kindwords

**A free, self-hostable testimonial wall.** Collect testimonials with a public form, approve them in an inbox, and show them on any website with one script tag. It runs with one `docker compose up`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/wall-dark.png">
  <img src="docs/media/wall-light.png" alt="A product page with a Kindwords wall of five testimonial cards in a masonry layout: star ratings, quotes, names, roles and avatars, with the featured card marked by a green edge">
</picture>

## How it works

**1. Collect.** Share a link. Customers write a few words, pick a rating, add a photo if they like, and agree to be shown publicly.

![A customer fills in the Kindwords collection form with name, email, role, a five-star rating and a short testimonial, ticks consent and sends it](docs/media/demo-collect.gif)

**2. Approve.** New testimonials wait in your inbox. Nothing is public until you approve it. Feature the best ones to pin them first.

![The admin inbox: the new testimonial is approved, then featured, and moves to the top of the approved list](docs/media/demo-approve.gif)

**3. Embed.** Approved testimonials appear on your site, inside its own Shadow DOM so your page's CSS can't break it.

![The product page now shows the new featured testimonial first, and a long testimonial opens with Read more](docs/media/demo-embed.gif)

## Features

- **Collection form** for each space (one space per product): name, email, role or company, optional photo, 1–5 star rating, text and a required consent checkbox. Email is never shown publicly.
- **Spam protection** with a hidden honeypot field and per-client rate limiting. No CAPTCHA.
- **Moderation inbox**: approve, reject, edit (the original text is kept, visible only to the admin), feature, delete, or add a testimonial by hand.
- **Embed** in a Shadow DOM: masonry layout, light, dark or auto theme, under 15 KB gzipped.
- **Wall page** for each space, to link to or embed as an iframe.
- **JSON feed** of approved testimonials.
- **Your choice of storage**: SQLite or Postgres for data, local disk or any S3-compatible store for photos.

## Quick start

You need Docker with Compose v2.

```bash
git clone https://github.com/AnandSundar/Kindwords.git
cd Kindwords
cp .env.example .env
docker compose up -d
docker compose logs kindwords   # find the line "Kindwords setup code: ..."
```

1. Open http://localhost:3000/setup, enter the setup code and create the admin account. The code is printed only while no admin account exists.
2. Create a space for your product.
3. Share its collection link (`/c/...`) with customers, and paste its embed code into your site.

The host port is 3000 by default; change it with `KINDWORDS_PORT` in `.env`. Before you share any links, set `PUBLIC_URL` in `.env` to the address people use (see [Configuration](#configuration)).

<table>
  <tr>
    <td width="50%"><img src="docs/media/collection-form.png" alt="The public collection form for Pebble Notes: name, email (never shown publicly), role and company, a rating from 1 to 5 stars, the testimonial text, an optional photo and the consent checkbox"></td>
    <td width="50%"><img src="docs/media/moderation-inbox.png" alt="The moderation inbox with two pending testimonials, each with Approve, Reject, Edit and Delete buttons"></td>
  </tr>
  <tr>
    <td align="center">The collection form customers see</td>
    <td align="center">The moderation inbox</td>
  </tr>
</table>

## Embedding a wall

Each space's admin page shows its collection link, wall page and embed code, with your public address filled in.

<img src="docs/media/embed-code.png" width="560" alt="The admin page for a space, showing the collection link, the wall page link, the script tag and the iframe code to copy">

The script tag:

```html
<script src="https://reviews.example.com/embed.js" data-space="SPACE_ID" async></script>
```

The wall appears where the tag is.

| Attribute | Required | Meaning |
|-----------|----------|---------|
| `data-space` | yes | The space's public ID, as shown in its embed code |
| `data-theme` | no | `light`, `dark` or `auto` (the default). `auto` follows the visitor's system setting |
| `data-featured` | no | Add it with no value to show only featured testimonials. `data-featured="false"` turns this off |

To change the font, set `--kindwords-font` on your page. The widget loads no fonts itself, so load a web font on your page and name it here:

```css
:root {
  --kindwords-font: Georgia, serif;
}
```

**Iframe.** Each space also has a wall page, `https://reviews.example.com/w/SPACE_ID`, to link to or embed:

```html
<iframe src="https://reviews.example.com/w/SPACE_ID?theme=dark&featured=1" title="Testimonials" loading="lazy" style="width:100%;height:600px;border:0"></iframe>
```

`theme` accepts `light` or `dark`; anything else means `auto`. `featured=1` shows only featured testimonials. The iframe height is fixed, so the wall scrolls inside it.

**JSON feed.** `https://reviews.example.com/api/public/SPACE_ID/testimonials` returns approved testimonials, readable from any site without credentials. Add `?featured=1` for featured ones only.

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

`rating`, `roleCompany` and `avatarUrl` can be `null`. `avatarUrl` is absolute when `PUBLIC_URL` is set; otherwise it is a path to resolve against the feed's address. Featured testimonials come first, then newest first.

Only approved testimonials are ever public. No public surface includes email addresses or the original text of an edited testimonial.

## Configuration

Copy `.env.example` to `.env` and edit it. Every setting is optional; the defaults run a single-machine install.

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_URL` | unset (uses the request address) | The address people use to reach Kindwords, with no trailing slash. Set it in production |
| `KINDWORDS_PORT` | `3000` | Host port for `docker compose up`. The container always listens on 3000 |
| `TRUSTED_PROXY_COUNT` | `0` | Number of reverse proxies in front of Kindwords (see [Behind a reverse proxy](#behind-a-reverse-proxy)) |
| `DATABASE_URL` | `file:/data/kindwords.db` | `file:` path for SQLite, or a `postgres://` or `postgresql://` URL |
| `STORAGE_DRIVER` | `local` | `local` for disk, or `s3` for an S3-compatible store |
| `UPLOADS_DIR` | `/data/uploads` | Photo folder when `STORAGE_DRIVER=local` |
| `S3_BUCKET` | none | Bucket name. Required when `STORAGE_DRIVER=s3` |
| `S3_REGION` | `us-east-1` | Bucket region |
| `S3_ENDPOINT` | unset (the AWS default) | Endpoint URL for other S3-compatible stores such as MinIO or Cloudflare R2 |
| `S3_ACCESS_KEY_ID` | unset | Access key. Set it together with `S3_SECRET_ACCESS_KEY`, or leave both unset |
| `S3_SECRET_ACCESS_KEY` | unset | Secret key. Set it together with `S3_ACCESS_KEY_ID`, or leave both unset |

Set `PUBLIC_URL` to the address people use, with `https://` in production. Kindwords uses it for:

- **Share links and embed code**: the collection link, wall link and script tag.
- **Absolute photo URLs** in the JSON feed.
- **The Secure cookie**: the login cookie is marked `Secure` only when `PUBLIC_URL` starts with `https://`, so plain-HTTP installs on a local network can still log in.

## Behind a reverse proxy

Set `TRUSTED_PROXY_COUNT` to the number of proxies between the internet and Kindwords: one nginx or Caddy means `1`. Leave it at `0` only when clients connect directly. Too high, and clients can fake their IP address. `0` behind a proxy, and every visitor shares the proxy's rate-limit bucket.

The proxy must also forward the original `Host` header. Without `PUBLIC_URL`, Kindwords builds links from `Host` and refuses form posts whose `Origin` does not match it. Caddy forwards it by default; nginx needs it set explicitly.

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

## Database and storage

The defaults are a SQLite file and local photos, both in the `kindwords-data` volume. Postgres and S3 are optional settings in `.env`. Kindwords has no tool to move data between SQLite and Postgres, or between local disk and S3, so choose before you collect any data.

Postgres (`docker-compose.yml` does not start a database; point `DATABASE_URL` at a Postgres server you run):

```
DATABASE_URL=postgres://kindwords:PASSWORD@db.example.com:5432/kindwords
```

S3-compatible storage (the bucket does not need to be public; Kindwords serves photos itself at `/media/...`):

```
STORAGE_DRIVER=s3
S3_BUCKET=kindwords
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.example.com
S3_ACCESS_KEY_ID=YOUR_KEY_ID
S3_SECRET_ACCESS_KEY=YOUR_SECRET
```

## Backups

The `kindwords-data` volume holds the SQLite file (`kindwords.db`) and local photos. Docker Compose names it `<folder>_kindwords-data`, where the folder name is the project name by default. Stop the container, then back up that volume, so the SQLite file is not written during the copy. If you use Postgres or S3, back up that database or bucket instead.

## Reset the admin password

```bash
docker compose exec -it kindwords reset-password
```

Type the new password at the prompt. This signs out every session, including yours.

## Development

Requires Node 24 and npm.

```bash
npm ci
mkdir -p data
DATABASE_URL=file:./data/kindwords.db UPLOADS_DIR=./data/uploads npm run db:migrate
npm run dev
```

These commands use POSIX shell syntax; in PowerShell, set `$env:DATABASE_URL` and `$env:UPLOADS_DIR` first. `npm run dev` builds the embed script and starts the Next.js dev server at http://localhost:3000. It reads `.env`, so put the same two values there too. The setup code prints in the terminal.

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

<sub>The screenshots and recordings show the real app with fictional sample data. The recordings are also in `docs/media/` as WebM.</sub>
