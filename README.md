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

A catalog entry with `distribution: "kernel"` publishes one of firecrab's
digest-pinned, per-architecture Firecracker kernels (see
`firecrab-api/src/oci/kernel.rs` in the main firecrab repository), keyed as
`kernel/<kernel-version>/<architecture>/<alias>.tar.zst`. It flows through
the same `version`/`architecture`/`package` hierarchy as an OS image, so no
code change is needed to expose a new kernel release — the index page groups
`kernel/` under a separate "Kernels" heading, apart from OS image
distributions, purely by grouping the `kernel` distribution name at render
time.

## Deployment

Pushes to `main` that change `public/index.html` or `public/app.js` upload
those two files to the `registry` R2 bucket. The workflow uploads `app.js`
first and `index.html` last. It does not modify `catalog.json` or image
packages.

Add these GitHub Actions secrets before the first deployment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with object write access to the `registry` bucket

The zone URL Rewrite Rule maps `/` to `/index.html`; it does not upload files.
