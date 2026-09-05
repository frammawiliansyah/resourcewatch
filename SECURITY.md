# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report them privately through
[GitHub Security Advisories](https://github.com/frammawiliansyah/resourcewatch/security/advisories/new).
You can expect an initial response within 7 days.

Include: affected version, a description of the issue, reproduction steps, and
the potential impact.

## Deployment considerations

ResourceWatch exposes detailed information about the host it runs on: running
processes, hardware identifiers, and resource utilisation history.

**There is no authentication built in.** The default `bind_addr` is `0.0.0.0`,
which listens on every interface. Before running this on a machine reachable
from an untrusted network:

- Set `bind_addr = "127.0.0.1"` in `config.toml` and reach it over an SSH
  tunnel, **or**
- Put it behind a reverse proxy (nginx, Caddy, Traefik) that terminates TLS and
  enforces authentication, **or**
- Restrict access at the firewall level.

The systemd unit shipped in `deploy/systemd/` runs the service as a dedicated
unprivileged `resourcewatch` user with `ProtectSystem=strict`, `ProtectHome`,
and `NoNewPrivileges` enabled. Keep those settings unless you have a specific
reason to relax them.

## Supported versions

The latest release on `main` receives security fixes.
