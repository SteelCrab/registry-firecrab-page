# registry-firecrab-page

Static Cloudflare R2 index for the Firecrab M2Image registry.

- Site: `https://registry.firecrab.dev`
- R2 bucket: `registry`
- R2 index object: `index.html`
- Source directory: `public`
- Build command: none

This repository intentionally contains no Pages Functions, Worker, framework,
or build dependency. Cloudflare R2 serves `index.html`, `app.js`,
`catalog.json`, and the image archives directly. A zone URL Rewrite Rule maps
`/` to `/index.html`.

The browser fetches the versioned `catalog.json` and renders its
`distribution`, exact `distributionVersion`, `architecture`, and `package`
hierarchy at runtime. `series` remains separate metadata (for example, Alpine
series `3.24` and distribution version `3.24.1`). Legacy entries remain
supported by validating and reading missing segments from the package key.
Publishing a new catalog entry is enough to expose every directory and
download link; no per-release HTML update is required.

firecrab's digest-pinned, per-architecture Firecracker kernels (see
`firecrab-api/src/oci/kernel.rs` in the main firecrab repository) are
published to a **separate** `/kernel/catalog.json`, not the root
`catalog.json` — its top-level array is `kernels`, not `images`, and entries
have no `distribution` field. The browser fetches both catalogs and merges
them before rendering; `kernel/catalog.json` is optional; a `404` there just
means no kernels are published yet, and the rest of the page still renders.

Each kernel entry's `package` (`kernel/<kernel-version>/<architecture>/<alias>.tar.zst`)
still fits the same 4-segment `distribution/version/architecture/filename`
shape as an OS image, so it flows through the same parsing and directory
rendering unchanged, grouped under a "Kernels" heading (everything else
falls under "Images") purely because its path's first segment is literally
`kernel`.

## Deployment

`.github/workflows/deploy-r2.yml` uploads `public/app.js` then
`public/index.html` to the `registry` R2 bucket, in that order, and touches
nothing else (not `catalog.json`, not image or kernel packages). It is
**manual only** (`workflow_dispatch`) because `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` are not configured as repository secrets; add both as
GitHub Actions secrets (a token with object write access to the `registry`
bucket) and switch the workflow back to a `push` trigger to automate this.

Until then, deploy by hand from a machine with a Cloudflare login:

```sh
npm install --no-save wrangler@4
./node_modules/.bin/wrangler login

./node_modules/.bin/wrangler r2 object put registry/app.js \
  --file public/app.js --remote \
  --content-type "application/javascript; charset=utf-8" \
  --cache-control "no-cache"

./node_modules/.bin/wrangler r2 object put registry/index.html \
  --file public/index.html --remote \
  --content-type "text/html; charset=utf-8" \
  --cache-control "no-cache"
```

The zone URL Rewrite Rule maps `/` to `/index.html`; it does not upload files.
