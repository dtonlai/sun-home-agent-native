# Local development

This repository is already the standalone Sun Home Agent Native app. Clone it
directly; do not create a separate Content app.

## Requirements

- Git
- Node.js 22.22 or later
- Corepack, included with Node.js, to enable the pnpm version pinned by the
  repository

## Clone and install

From a terminal, run:

```sh
git clone https://github.com/dtonlai/sun-home-agent-native.git
cd sun-home-agent-native
corepack enable
pnpm install
```

## Environment variables

No environment variables are required to start the local app. You do not need
to create an environment file or configure an AI provider just to open it.
Choose **Continue as local dev** on the Welcome screen. To use agent responses,
connect a model separately in the app.

`.env.example` lists optional integrations for other configurations. For
example, `DATABASE_URL` is optional for local development, and `GEMINI_API_KEY`
and `OPENAI_API_KEY` are optional AI provider keys. `BETTER_AUTH_SECRET` is
required for standalone production deployments, not this local workflow. If
you configure an optional value, keep it in a local, untracked environment file
and use a private value from the relevant provider; never commit credentials.

## Check and run

Run the repository's type check from the project root:

```sh
pnpm typecheck
```

Start the app:

```sh
pnpm dev
```

Open the local URL printed by the command. On the Welcome screen, choose
**Continue as local dev**. Stop the server with `Ctrl+C` when finished.

The command names above are defined in `package.json`; the app setup and local
Welcome-screen flow are described in the repository README.
