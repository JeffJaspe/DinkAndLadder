# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

This project uses [pnpm](https://pnpm.io) as its package manager — install commands should always
be run from the repo root (pnpm workspaces), not from inside `apps/web`.

## Setup

Make sure to install dependencies:

```bash
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm --filter web run dev
```

## Production

Build the application for production:

```bash
pnpm --filter web run build
```

Locally preview production build:

```bash
pnpm --filter web run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
