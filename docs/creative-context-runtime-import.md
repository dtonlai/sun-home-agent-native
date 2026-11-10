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

## Recommendation

Escalate this to the `@agent-native/creative-context` maintainers as a
publication defect. The smallest upstream correction is to emit a Node-valid
relative specifier such as `./AgentMark.js` (or bundle the component), with a
regression check that imports `@agent-native/creative-context/client` under
native Node ESM. The registry still reports 0.8.68 as latest. Do not add an
application patch or SSR override based on this investigation alone; provide
the exact route and action if the user wants the app-level trigger mapped too.
