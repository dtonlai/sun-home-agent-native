# Creative Context AgentMark runtime import diagnosis

**Investigated:** 2026-11-10

**App version:** `@agent-native/creative-context` 0.8.68

## Finding

The failure reproduces as a native Node ESM resolution error in the published
0.8.68 package. The installed package is complete and byte-for-byte matches
the published npm tarball, excluding pnpm's installed `node_modules` links.
This points to an extensionless relative import in the published ESM output,
not a stale or incomplete local installation.

## Evidence

- `package.json` and `pnpm-lock.yaml` select `@agent-native/creative-context`
  0.8.68. `npm view @agent-native/creative-context version` also returns
  0.8.68. The package declares `"type": "module"` and exports
  `./client` as `dist/client/index.js`.
- `npm pack @agent-native/creative-context@0.8.68` produced a 729-file tarball.
  Its SHA-512 integrity is
  `sha512-oajuHwBJ/EsflEFykQI5/QRFRGJRDnafVF88a7RfL2ioJ7biJ+xQcE11+1CjcA1IFcvx30gP7CZAQEc0Zt7QVg==`,
  matching both `npm view` metadata and the lockfile. Comparing the unpacked
  tarball with the installed package (`diff -qr --exclude=node_modules`) found
  no differences.
- Published `dist/client/CreativeContextPanel.js:10` contains
  `import { AgentMark } from "./AgentMark"`, while
  `dist/client/AgentMark.js` exists. The published TypeScript source has the
  same extensionless import at `src/client/CreativeContextPanel.tsx:111`; its
  `tsconfig.json` uses `moduleResolution: "bundler"`. A scan of all published
  `dist/client/**/*.js` files found this is the only extensionless relative
  import; its `.js` sibling exists.
- Running `node --input-type=module -e "import('@agent-native/creative-context/client')"`
  with Node.js `v24.22.2` reproduces:

  ```text
  ERR_MODULE_NOT_FOUND: Cannot find module '.../dist/client/AgentMark'
  imported from .../dist/client/CreativeContextPanel.js
  ```

  Node ESM does not append `.js` to this relative specifier, even though the
  sibling file exists.
- The app imports `@agent-native/creative-context/client` in
  `app/components/layout/Layout.tsx`, `app/components/sidebar/DocumentTreeItem.tsx`,
  and `app/routes/_app.settings.tsx`. The package's client index re-exports
  `CreativeContextPanel`; the app has `ssr: true` in `react-router.config.ts`.
  `vite.config.ts` configures Agent Native plugins but has no package-specific
  `ssr.noExternal` or `ssr.external` rule.
- Version-matched Core 0.226.0 `framework-search` returned no documented
  `noExternal` result; the `ssr.external` source search returned no result
  (and noted that the optional first-party template corpus is not installed).
  No Agent Native-specific SSR workaround was found in the installed docs.

The package-level Node import reproduces without choosing an app route. The
exact route or action that triggered the user's runtime error was not provided,
so its UI entry point is not independently confirmed.

## P1P-T04: reviewed Vite SSR option

The approved app-owned change adds only
`ssr.noExternal: ["@agent-native/creative-context"]` to `vite.config.ts`.
Vite 8.1.0's [SSR options documentation](https://vite.dev/config/ssr-options.html)
defines `ssr.noExternal` as preventing listed dependencies from being
externalized for SSR, and says they are bundled in build. Installed Core
0.226.0's Vite plugin also appends `userConfig.ssr.noExternal` to its dev SSR
dependency list (`node_modules/@agent-native/core/dist/vite/client.js`).

### Production build

Ran `pnpm build` (exit 0; output: `Build complete.`). It emitted bundled
`AgentMark` assets for both client and server:

```text
build/client/assets/AgentMark-tThENsj2.js
build/server/assets/AgentMark-B9KjQsBs.js
```

The build also printed the existing template doctor findings and missing
production-only auth/database environment diagnostics; no credentials were
added.

### Single local development request

Before build, at `2026-11-10T20:08:20Z`, observed 10 processors, load average
`0.00, 0.05, 0.07`, 7.9 GiB memory total with 7.4 GiB available, 7.9 GB free
workspace disk, `max_user_watches=65194`, `max_user_instances=128`,
`max_queued_events=16384`, and `ulimit -n=1048576`. No app server was running.

Ran one documented dev session, with output captured to `/tmp/p1p-t04-dev.log`:

```sh
pnpm dev
```

Vite 8.1.0 became ready in 3286 ms and printed
`http://localhost:8080/`. Requested `/settings`, whose route imports
`@agent-native/creative-context/client`:

```sh
curl --max-time 30 -sS -D /tmp/p1p-t04-settings.headers \
  -o /tmp/p1p-t04-settings.html \
  -w 'HTTP %{http_code}; content-type %{content_type}; bytes %{size_download}; time %{time_total}s\n' \
  http://localhost:8080/settings
```

Result: HTTP 500, `text/plain`, 577 bytes, 6.944046 seconds. The body and
server log still contain the same `ERR_MODULE_NOT_FOUND` for
`dist/client/AgentMark` imported by `CreativeContextPanel.js`. Startup also
logged watcher-limit fallbacks to polling, but the server started and this
request's failure was the same module-resolution error.

Stopped the server with Ctrl+C after the request. Follow-up process and port
checks were empty. No OS watcher limits, sandbox settings, package files, or
dependencies were changed.

## Recommendation and remaining limit

The approved option fixes the production bundle but did not fix the dev SSR
request, despite the installed Core dev hook including the user option. No
second dev run or additional workaround was attempted. Ask the lead to review
why this runtime still loads the external package directly before changing
configuration further. The exact route/action from the original user report
remains unknown; `/settings` independently confirms the issue on a route that
imports the package.

## P1P-T04 source trace: development SSR loader

Source inspection for Core 0.226.0, Vite 8.1.0, and Nitro 3.0.260903-beta
confirms the dev request path:

1. Core's CLI `dev` command launches the local Vite executable
   (`node_modules/@agent-native/core/dist/cli/index.js`, `case "dev"`).
2. Core's Vite plugin detects the app's `ssr-entry.ts` and registers it as
   Nitro's `experimental.vite.services.ssr.entry`. This entry calls
   `createRequestHandler(() => import("virtual:react-router/server-build"))`.
3. Nitro's Vite integration routes that SSR service through its `ssr`
   environment. Its dev worker imports the entry with Vite's `ModuleRunner`
   (`node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/vite/dev-worker.mjs`);
   Nitro's SSR renderer dispatches requests to that service. React Router's
   own dev middleware also imports its server build with
   `ssrEnvironment.runner.import(...)` (`node_modules/@react-router/dev/dist/vite.js`).

This is Vite's environment module runner, not a prebuilt production server
bundle or direct native Node import of the app's route bundle. The runner
transforms modules itself but delegates externalized dependencies to Node;
that matches the captured `ModuleLoader` stack and the package file path in
the error.

Core's dev config construction appends the configured package string to
`ssr.noExternal` (`node_modules/@agent-native/core/dist/vite/client.js`). Vite
8.1.0 maps this legacy SSR option to the `ssr` environment's
`resolve.noExternal` (`node_modules/vite/dist/node/chunks/node.js` around
35168). React Router and Nitro then define the `ssr` environment without
source code explicitly removing that entry. Therefore source configuration
indicates the resolved SSR environment should include
`@agent-native/creative-context`; the previous run did not capture the final
runtime environment object, so this is not a runtime dump.

The remaining contradiction is that Node handled the package import even
though Core's configuration construction includes it in `noExternal`. Source
inspection identifies no supported config change that explains or fixes this
specific run. The smallest next diagnostic is to inspect the live
`server.environments.ssr.config.resolve.noExternal` and Vite runner's
externalization result in one approved dev run. Until that confirms whether
the option was lost during environment resolution or a different loader path
was used, keep the implementation unchanged; no package patch or extra SSR
override is justified by the evidence so far.

## P1P-T04 targeted debug run

Michael authorized one diagnostic dev run on 2026-11-10. Before starting, no
`agent-native dev`, Vite, Nitro, or React Router dev process was present and
ports 8080/9229 had no listeners. Resources: 10 processors; load
`0.09, 0.23, 0.22`; 7.9 GiB memory total with 6.5 GiB available; 5.8 GB free
disk; inotify watches/instances/queue `65194/128/16384`; file descriptor limit
`1048576`.

The package script is `agent-native dev --inspect`. Core CLI `dev` removes the
Node inspect flag and forwards remaining args to the Vite executable via
`runDevServer(vite, rest)` (`node_modules/@agent-native/core/dist/cli/index.js`
and `cli/process.js`). Ran exactly once:

```sh
pnpm dev -- --debug
```

Vite 8.1.0 started at `http://localhost:8080/`; debug output confirmed the
flag was active. The resolved config contains **two server environments with
different `noExternal` lists**:

- `environmentName: 'ssr'` includes `@agent-native/creative-context` in
  `resolve.noExternal`.
- `environmentName: 'nitro'` does not include it. Its `noExternal` list has
  Nitro/runtime dependency patterns, WASM/TS patterns, virtual IDs, and
  app-local files, but no Creative Context package entry.

The one requested curl to `/settings` returned HTTP 500, text/plain, 577
bytes, in 6.566746 seconds. The `[ssr-handler]` error again shows Node's ESM
`ModuleLoader` trying to load `CreativeContextPanel.js`'s extensionless
`./AgentMark` import directly from the installed package. The trace contains
no explicit Vite “externalized” diagnostic and no transform log for
`CreativeContextPanel.js`; the Node loader path and the absence of the package
from the `nitro` environment's `noExternal` list are direct evidence
consistent with externalization in that environment. The configured
`ssr.noExternal` entry applies to Vite's `ssr` environment, while this H3 SSR
request is handled by the Nitro catch-all route, so the option was present but
on a different environment from the failing route's loader.

Stopped the dev process immediately after the request; process and port
checks afterward were empty. Watcher-limit polling fallbacks appeared during
startup. No config, package, dependency, OS, or sandbox changes were made. The
smallest next-step proposal for review is to determine whether the installed
Core/Nitro integration supports adding this package to the `nitro`
environment's `resolve.noExternal`, then test only after explicit approval;
do not treat this diagnostic as authorization to implement that change.
