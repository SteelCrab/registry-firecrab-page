# registry-firecrab-page

Static Cloudflare Pages index for the Firecrab M2Image registry.

- Site: `https://registry.firecrab.dev`
- Downloads: `https://downloads.registry.firecrab.dev`
- Pages output directory: `public`
- Build command: none

This repository intentionally contains no Pages Functions, Worker, framework,
or build dependency. Image archives remain in Cloudflare R2; Pages only serves
the index and redirects download paths to the R2 custom domain.
