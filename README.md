# registry-firecrab-page

Static Cloudflare R2 index for Firecrab kernels.

- Site: `https://registry.firecrab.dev`
- R2 bucket: `registry`
- R2 index object: `index.html`
- Source directory: `public`
- Kernel catalog: `/kernel/catalog.json`
- Build command: none

The page reads only the kernel catalog. It does not request the deleted root
image catalog or list OS images. Each entry supplies the kernel version,
architecture, and actual package key.

Both package layouts are supported:

```text
kernel/<version>/<architecture>/<filename>
kernel/<version>/r<revision>/<architecture>/<filename>
```

The visible hierarchy stays `kernel/version/architecture`. Package and
`SHA256SUMS` links use the actual package directory, including its revision.
Versions are listed newest first.

Directory links use `/?path=kernel/<version>/<architecture>` so opening a link
in a new tab, sharing it, and reloading work with the existing root-only R2 URL
rewrite. Old clean paths can still be parsed when a server serves them.
No Worker, Pages Function, framework, or build dependency is required.

## Validation

```sh
node --check public/app.js
node --test tests/*.test.mjs
```

Tests use Node.js built-ins. They cover the missing image catalog, revisioned
package and checksum links, both architectures, legacy package paths, directory
navigation, and kernel catalog errors.

## Deployment

`.github/workflows/deploy-r2.yml` validates the files and uploads `public/app.js`
then `public/index.html` to the `registry` R2 bucket. It changes no catalog or
kernel package. The workflow is manual because its Cloudflare repository
secrets are not configured.

Deploy from a machine with a Cloudflare login:

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

The existing zone URL Rewrite Rule maps `/` to `/index.html`.
