# Deployment Guide

Papercut is a static web application. No application server is needed for conversion.

## Recommended First Deployment

For the simplest production launch, use Cloudflare Pages, Netlify, or Vercel:

- Connect the GitHub repository `colin-110/papercut`.
- Production branch: `main`.
- Build command: `npm run build`.
- Output directory: `dist`.
- Node.js version: `22`.
- Deploy only after the CI workflow passes.

These services provide HTTPS and automatic deploys. Use a custom domain only after confirming the HTTPS certificate is active.

## GitHub Pages

GitHub Pages is also suitable, but project pages are served below `/papercut/`. Set the Vite base path to `/papercut/` before deploying there. If using a custom domain, use `/` instead.

After deployment, check the browser network panel for:

- The main JavaScript bundle.
- The stylesheet.
- `pdf.worker-*.mjs`.
- Favicon and public assets.

A missing worker or asset path means the Vite base path does not match the public URL.

## Security Headers

Configure the hosting provider to send HTTPS and a restrictive Content Security Policy. Start with the policy below and test it against the deployed build; adjust only when a required browser feature is blocked:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
img-src 'self' blob: data:;
worker-src 'self' blob:;
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self';
font-src 'self';
```

Do not add remote analytics, session replay, advertising, or font providers without reviewing whether they weaken the local-only privacy promise.

## Before Opening to Real Users

- Test Chrome, Firefox, Safari, and mobile Safari/Chrome.
- Test an image, a multi-page PDF, several files, an empty file, a malformed file, and a file close to the size limit.
- Test image-to-PDF and PDF-to-image downloads.
- Test a slow device and a large PDF for memory pressure.
- Verify the PDF.js worker loads over HTTPS.
- Verify no request contains file bytes or filenames unexpectedly.
- Add a support address or GitHub issue link.
- Publish a privacy policy that names your host, logs, analytics, and retention behavior.
- Enable GitHub branch protection and require CI before merging.
- Keep dependencies updated and review Dependabot alerts.

## Releases

1. Open a pull request.
2. Wait for CI to pass.
3. Test the production preview.
4. Merge to `main`.
5. Let the hosting provider deploy.
6. Test the public URL again.
7. Create a GitHub release when the change is user-facing.
