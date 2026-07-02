# CLAUDE.md

## Git — never commit or push without being asked in that exact message

Never run `git commit` or `git push` as part of a broader task, even one phrased as "do all of X" or "finish the cutover" — that is not authorization for git actions. Only commit/push when the user's message explicitly says so for that specific action, every time. Prior approval does not carry forward to later turns or later commits.

## Packages

| Package | Role | Port |
|---|---|---|
| `blogt-api` | Express read API — serves posts from file-based markdown | 3000 |
| `blogt-editor` | Express authenticated write backend + AI vision | 3001 |
| `blogtv` | Vue 3 + Vite SPA (readers) served via Nginx in prod | 5173 dev |
| `blogger` | Express SSR archive of old Blogger blogs; served at `/archive/` via Nginx proxy | 3000 (set `PORT=3002` locally to avoid conflict with blogt-api) |

No monorepo build tool. Each package is built and deployed independently.

## Commands

```bash
# from repo root
npm run install:all
npm run start:api
npm run start:editor
npm run start:tv
npm run start:blogger

# per package
npm run dev    # nodemon (api/editor) or vite dev server (blogtv)
npm start      # production
npm run build  # blogtv only
```

No test suite exists in any package.

## Date format — critical

**All dates throughout the codebase are `DDMMYYYY` (e.g. `27042026`)**, not ISO format.
The post front-matter `Date:` field and every URL param use this format.
`ddmmyyyyToSortKey` in `utils/utils.js` converts to a numeric sort key.

## blogt-api

### Routes (mounted in `app.js`)

| Method | Path | Returns |
|---|---|---|
| GET | `/post` | Latest 10 posts as raw-markdown `string[]` |
| GET | `/post/:ddmmyyyy` | Single post as raw-markdown `string[]` (index 0) |
| GET | `/post/details/:ddmmyyyy` | `{date, title, tags[], content, prev, next, imageUrl}` |
| POST | `/post/:ddmmyyyy` | Create post; fire-and-forget tag index update |
| PUT | `/post/:ddmmyyyy` | Update post; awaited tag index update |
| GET | `/posts/from/:ddmmyyyy` | 10 posts backwards from date as raw-markdown `string[]` |
| GET | `/tags/:tagName` | `[{date, title}]` newest-first from `tags_index.json` |
| GET | `/posts/archives` | `archive.json` contents |
| GET | `/posts/buildarchives` | Rebuild archives on the fly |
| GET | `/rss.xml` | RSS feed |
| GET | `/health` | Kubernetes liveness probe |

### Post file format

```
posts/{year}/{month}/{day}.md

Date: DDMMYYYY
Tags: tag1, tag2
Title: Post title

Body markdown...
```

### In-memory date cache (`utils/utils.js`)

`_sortedDates` caches the full chronological list of post dates. **Any operation that creates or deletes a post file must call `invalidateDateCache()`** — `updateTagsIndexForPost` does this automatically. Do not call `loadSortedDates()` directly; use `getSortedDates()` (lazy, concurrent-safe).

### Tags index

`posts/tags_index.json` maps `tag → [{date, title}]`, sorted newest-first.
Update it with `updateTagsIndexForPost(date, title, tags)` for single-post changes,
or `updateTagsIndex()` for a full rebuild.

### Debug logging

All debug output uses the `debug` package. No `console.log/error/time` in route files.
Enable with `DEBUG=blogt-api:*` (or `blogt-editor:*`).

## blogtv (a VUE single page app)

### Config — must use for all URLs

```js
// src/config.js
import { API_BASE, MEDIA_BASE } from '@/config'
```

Never hardcode API or media hostnames. In dev, `API_BASE = http://localhost:3000`. In prod, `API_BASE = /api` (proxied by Nginx to `blogt-api:3000`).

### Env vars

| Var | Used by | Purpose |
|---|---|---|
| `VITE_API_BASE` | blogtv | API host (`/api` prod). Injected as Docker build ARG in `blogtv/Dockerfile` — baked into the bundle at build time, not a runtime var. |
| `VITE_MEDIA_BASE` | blogtv | Media host (`https://objects.ekskog.net`). Also a Docker build ARG — must be in `blogtv/Dockerfile` or images break in production. |
| `VITE_GEMINI_API_KEY` | blogtv | Gemini AI analysis in `GeminiViewer` |
| `BASE_PATH` | blogger | URL prefix when served behind a proxy (e.g. `/archive`). All generated hrefs are prefixed; `/images/` paths in post HTML are rewritten via `localise()`. |
| `SESSION_SECRET` | blogt-editor | Session encryption (falls back to hardcoded string) |
| `IN_CONTAINER` | blogt-editor | Set to `1` in Docker |
| `MEDIA_BASE` | blogt-api | Media host for `imageUrl` in responses |
| `DEBUG` | api + editor | Log verbosity |

### `postStore` is not reactive

`src/stores/posts.js` is a **plain object**, not Pinia. It does not trigger Vue reactivity. Components must copy values into `data()` or local `ref()` and refresh them explicitly.

### `BlogPost.vue` fetches its own data

`BlogPost` always fetches `GET /post/details/:date` on route change (watch on `$route.params.date`). It does not rely on `postStore.currentPost` for initial render. Navigation uses `post.prev`/`post.next` from the API response — no client-side date walking.

### Image URL pattern

```
{MEDIA_BASE}/blotpix/{year}/{month}/{day}.jpeg
```

**`BlogPost.vue`** — uses `post.imageUrl` returned by `GET /post/details/:ddmmyyyy`. Do not recompute it client-side.

**`BlogPosts.vue`** — receives raw markdown strings (no structured response), so it builds the image URL client-side from `MEDIA_BASE`. If `VITE_MEDIA_BASE` is not baked into the production bundle, every image in the posts list will be broken while single-post view works fine.

### Local dev against the cluster

The API runs in k3s, not locally. To use `npm run dev` without running `blogt-api` locally:

```bash
kubectl port-forward service/blogt-api 3000:3000 -n blogt
```

`.env` already points `VITE_API_BASE` at `http://localhost:3000`.

### Tailwind

Edit `src/assets/tailwind.css`. Output is generated — do not edit `src/assets/output.css` directly.
Path alias: `@/` → `./src`.

## blogger

### Data

Six old Blogger archives in `blogger/data/*.json`, pre-processed by `build.js` from Google Takeout Atom feeds. The JSON is static — re-run `build.js` only when importing a new export. Images are copied into `blogger/public/images/<slug>/` by the same script and baked into the Docker image (no NFS mount needed).

### Routes

| Path | Returns |
|---|---|
| `/` | Blog list (SSR HTML) |
| `/:blogSlug` | Post index grouped by year (SSR HTML) |
| `/:blogSlug/:year/:month/:postFile` | Individual post with prev/next nav (SSR HTML) |

### Adding a new blog

1. Add an entry to the `BLOGS` array in `build.js` with the correct `atomPath` and `albumPath` from the Takeout export.
2. Run `node build.js` from the `blogger/` directory.
3. Commit the updated `data/*.json` and any new `public/images/<slug>/` files.

## Deployment

Push to `main` → GitHub Actions builds Docker images → pushes to `ghcr.io/ekskog/` → deploys to Kubernetes namespace `blogt`. K8s manifests are in `k8s/` inside each package directory.

Nginx (`blogtv/nginx.conf`) proxies:
- `/api/*` → `blogt-api:3000/` (JSON API)
- `/archive/` → `blogger:3000/` (SSR HTML archive; `blogger` is ClusterIP-only, not exposed directly)

Vue SPA is served with `try_files $uri /index.html`.
