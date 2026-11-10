# Local application startup verification

**Task:** P1P-T01 — Verify local application startup and HTTP response

**Observed:** 2026-11-10 (UTC)

## Versions

- App: `sun-home-agent-native`
- `@agent-native/core`: `0.226.0`
- `@agent-native/toolkit`: `0.226.0`
- Node.js: `v24.22.2`
- pnpm: `10.14.0` (repository `packageManager` pin)

## Resources before startup

Observed at `2026-11-10T19:40:37Z`, before starting the server:

- Existing app server processes: none found (`agent-native dev`, Vite dev server,
  and `pnpm dev` process search was empty).
- Existing listeners on ports 8080–8083 and 9229: none.
- CPU: 10 available processors; system load average `0.00, 0.05, 0.16`.
- Memory: 7.9 GiB total, 525 MiB used, 7.4 GiB available; no swap.
- Workspace filesystem: 229 GiB total, 221 GiB used, 8.2 GiB available (97% used).
- File descriptor limit (`ulimit -n`): `1048576`.
- Linux inotify limits: `max_user_watches=65194`,
  `max_user_instances=128`, `max_queued_events=16384`.

Commands used for the resource check: `nproc`, `uptime`, `free -h`, `df -h .`,
`ulimit -n`, and reads of `/proc/sys/fs/inotify/{max_user_watches,max_user_instances,max_queued_events}`.
No dependency installation or build was run for this task.

## Startup and HTTP response

From the repository root, ran the documented development command, redirecting
its output to a temporary log for capture:

```sh
pnpm dev > /tmp/p1p-dev.log 2>&1
```

The server started without watcher errors and printed:

```text
[agent-native] Sun Home Agent Native listening on http://localhost:8080/
VITE v8.1.0 ready in 3277 ms
Local: http://localhost:8080/
Network: http://172.17.0.21:8080/
```

At `2026-11-10T19:41:08Z`, issued a GET request:

```sh
curl --max-time 20 -sS -D /tmp/p1p-http-headers.txt \
  -o /tmp/p1p-http-body.html \
  -w 'HTTP %{http_code}; content-type %{content_type}; bytes %{size_download}; time %{time_total}s\n' \
  http://localhost:8080/
```

Result:

```text
HTTP 200; content-type text/html; charset=utf-8; bytes 166598; time 0.527541s
```

The response was HTML with title `Content — Sign in`. This confirms the local
HTTP endpoint responded; no browser automation was used.

Stopped the server with Ctrl+C (expected process exit code `130`). A follow-up
process and listener check found no app server and no listener on ports
8080–8083 or 9229. No system watcher limits or sandbox settings were changed.
