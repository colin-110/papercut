# Contributing to Papercut

Thank you for helping improve Papercut.

## Before You Start

1. Open an issue for a substantial feature or behavior change.
2. Keep document processing local. Do not add an upload endpoint, remote conversion call, or telemetry containing file data.
3. Prefer browser APIs and existing dependencies already used by the project.

## Development

```bash
npm ci
npm run dev
```

Use small representative PDF and image fixtures locally. Do not commit private documents or generated build output.

## Pull Requests

Before opening a pull request, run:

```bash
npm run lint
npm run build
```

Describe the user-visible behavior, browsers tested, and any privacy or bundle-size impact. Keep commits focused and explain breaking changes clearly.

## Review Standards

- Unsupported and malformed input must fail with a useful message.
- Object URLs must be revoked when files are removed.
- Large or repeated operations must not silently upload data.
- UI changes must work on mobile and keyboard navigation must remain usable.
- New dependencies need a reason and should not introduce unnecessary tracking.
