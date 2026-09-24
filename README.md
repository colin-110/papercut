# Papercut

Papercut is a privacy-first image and PDF converter that runs entirely in the browser. Users can convert, combine, reorder, and export files without uploading document contents to a server.

**Repository:** <https://github.com/colin-110/papercut>

## What It Does

- Converts images to PDF.
- Merges PDF files into one PDF.
- Renders PDF pages to JPG, PNG, or WEBP.
- Converts batches of images into a downloadable ZIP archive.
- Supports PDF, JPG, JPEG, PNG, WEBP, GIF, and SVG input.
- Provides local quality controls, file ordering, and file removal.
- Rejects unsupported files and files larger than 250 MB.

## Privacy Model

Papercut has no file-upload API or processing backend. Files are read by browser APIs and processed locally with PDF.js, pdf-lib, Canvas, and JSZip. Exported files are downloaded directly by the browser.

The privacy promise applies to the application code in this repository. Production operators should also avoid analytics or session replay on the editor, avoid third-party scripts that receive document data, serve the site over HTTPS, configure a restrictive Content Security Policy, and publish a privacy policy that accurately describes hosting logs.

## Run Locally

Requirements: Node.js 22 or newer and npm.

```bash
git clone https://github.com/colin-110/papercut.git
cd papercut
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and create the production bundle in `dist/`. |
| `npm run preview` | Serve the production bundle locally. |
| `npm run lint` | Run Oxlint. |
| `npm ci` | Install the exact lockfile dependencies. |

## Architecture

```text
Browser UI
  -> local File and Blob APIs
  -> Canvas / PDF.js / pdf-lib / JSZip
  -> browser download
```

There is no application server in the conversion path. `src/App.tsx` owns the workflow and conversion pipeline. `src/Papercut.css` owns the product styling. `.github/workflows/ci.yml` runs lint and production build checks on pushes and pull requests.

## Production Hosting

Papercut can be hosted on any static hosting provider. The production output is the `dist/` directory.

See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting, security headers, and the go-live checklist. See [PRIVACY.md](PRIVACY.md) for a privacy notice template to complete before launch.

For Cloudflare Pages, Netlify, or Vercel use:

- Build command: `npm run build`
- Output directory: `dist`
- Node.js version: `22`

For GitHub Pages, decide whether the public URL is a project path such as `https://colin-110.github.io/papercut/` or a custom domain, then configure Vite's `base` value before deploying. Check that the PDF.js worker and application assets load from the final public URL.

### Production checklist

- Confirm `npm ci`, `npm run lint`, and `npm run build` pass.
- Test image-to-PDF, PDF-to-image, multi-page PDF, and batch export.
- Test Chrome, Firefox, Safari, and a mobile browser.
- Confirm downloads work with HTTPS and large files.
- Check that the PDF.js worker loads successfully.
- Add a restrictive CSP without blocking the worker or blob downloads.
- Add a visible support/contact path for users.
- Monitor uptime and JavaScript errors without capturing document contents.
- Publish `SECURITY.md` and a privacy policy before inviting real users.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. All changes must preserve the local-only processing model and pass lint and build checks.

## Security

Please report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not open a public issue containing a private document, secret, or exploitable detail.

## License

Papercut is released under the MIT License. See [LICENSE](LICENSE).
