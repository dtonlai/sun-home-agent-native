# Sun Home Agent Native

Sun Home v2 is a standalone Agent Native app for household knowledge and
recipes. This repository is already the app root; clone it and run the app
directly. Do not scaffold a separate Content app.

The current foundation uses Agent Native's upstream Content template for
documents and collections. The planned Recipes experience will read recipe
documents from Content and add agent-assisted scaling without replacing the
original recipe.

## Run locally

Requirements: Node.js 22.22 or later and Git. Corepack enables the pnpm version
pinned by this repository.

```bash
git clone https://github.com/dtonlai/sun-home-agent-native.git
cd sun-home-agent-native
corepack enable
pnpm install
pnpm dev
```

Open the local URL printed by `pnpm dev`. On the Welcome screen, choose
**Continue as local dev**. No provider key is needed to start the app; connect a
model separately to use agent responses.

For framework and Content behavior, use the version-matched guidance in
`.agents/skills/` and the [Agent Native Content developer guide](https://www.agent-native.com/docs/template-content-developers/).
