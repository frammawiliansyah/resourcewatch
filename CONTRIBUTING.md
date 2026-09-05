# Contributing to ResourceWatch

Thanks for taking the time to contribute. This document covers how to get a
development environment running and what to check before opening a pull request.

## Getting started

Prerequisites: [Rust](https://rustup.rs) (2024 edition), Node.js v18+, and npm.

```bash
git clone https://github.com/frammawiliansyah/resourcewatch.git
cd resourcewatch
./scripts/dev.sh start
```

That starts the Axum backend on `:8090` and the Vite dev server with HMR on
`:5173`. Open http://localhost:5173. Vite proxies `/api` and `/ws` to the
backend, so you get frontend hot reload against a live metric stream.

Use `./scripts/dev.sh logs` to tail both processes and `./scripts/dev.sh stop`
when you are done.

## Before opening a pull request

```bash
cargo fmt --all              # format Rust
cargo clippy -- -D warnings  # lint Rust
cargo build --release        # must compile clean

cd frontend
npm run lint                 # oxlint
npm run build                # tsc -b + vite build, must pass typecheck
```

Please make sure `./deploy/install.sh --no-service --prefix /tmp/rw-check`
still succeeds if you touched anything under `deploy/` or `scripts/`.

## Project layout

| Path | Purpose |
|---|---|
| `src/metrics/` | Hardware collectors, one module per metric family |
| `src/api/` | REST handlers (`rest.rs`) and the WebSocket stream (`ws.rs`) |
| `src/db/` | SQLite schema, inserts, and history queries |
| `src/retention.rs` | Background writer + retention cleanup worker |
| `frontend/src/components/cards/` | One card component per metric |
| `deploy/` | `install.sh`, systemd unit, launchd agent template |

## Adding a new metric

1. Add a collector module in `src/metrics/` and wire it into the `Snapshot`
   struct and `Collector::tick()` in `src/metrics/mod.rs`.
2. Extend `src/db/schema.sql` and the insert in `src/db/mod.rs` if the metric
   should be persisted for historical queries.
3. Add the metric name to `VALID_METRICS` in `src/api/rest.rs` and handle it in
   the history query.
4. Add the matching TypeScript type in `frontend/src/lib/types.ts` and a card in
   `frontend/src/components/cards/`.

Collectors must **never** panic or abort startup when hardware is absent. Follow
the pattern in `src/metrics/gpu.rs`: probe once, degrade to
`available: false`, and log a warning.

## Platform support

Linux is the primary target. macOS is supported on a best-effort basis. Some
sensors (notably GPU via NVML, and certain temperature sensors) are unavailable
there and correctly report as unavailable. If you can test a change on macOS,
please mention it in the PR.

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add per-core CPU frequency to the CPU card
fix: prevent NVML init panic on driver reload
docs: clarify retention configuration
```

## Reporting bugs

Open an issue including your OS and version, the output of `cargo --version`,
whether GPU metrics are expected, and the relevant portion of
`journalctl -u resourcewatch -n 50` or `logs/prod.log`.
