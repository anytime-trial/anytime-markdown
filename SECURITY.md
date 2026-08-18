# Security Policy

[日本語](SECURITY.ja.md) | [English](SECURITY.md)

## Reporting a Vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub: [**Report a vulnerability**](https://github.com/anytime-trial/anytime-markdown/security/advisories/new). Private vulnerability reporting is enabled on this repository, so the report stays visible only to you and the maintainers until a fix ships.

Please include:

- the affected component — VS Code extension name, MCP server, shared package, or the web app
- the version — the Marketplace version for an extension, the commit hash for a source checkout
- reproduction steps, and what an attacker gains from it
- your environment — OS, VS Code version, Node.js version

This project is maintained by a small team outside of business hours. Expect an initial acknowledgement within about a week. There is no bug bounty.

## Supported Versions

Only the latest published version of each component receives security fixes. There are no long-term support branches.

| Component | Supported |
| --- | --- |
| VS Code extensions published under the `anytime-trial` publisher | Latest Marketplace release |
| npm packages `@anytime-markdown/markdown-view` and `markdown-view-lite` | Latest published version |
| `master` branch | Yes |
| `develop` and `feature/*` branches | No — these are development branches, not releases |
| Any earlier release | No — upgrade to the latest |

## Scope

In scope:

- the VS Code extensions published under the `anytime-trial` publisher
- the MCP servers under `packages/mcp-*`, including how they resolve paths and read local databases
- the web app under `packages/web-app` and its deployment at `anytime-trial.com`
- the shared packages under `packages/*` as they are consumed by the above

Out of scope:

- vulnerabilities in a third-party dependency that have no exploit path through this project — report those upstream. If a dependency **is** exploitable the way this project uses it, that is in scope and we do want to hear about it
- findings that require the attacker to already have write access to the user's machine or workspace
- missing hardening with no demonstrated impact — a scanner result on its own is not a report

## What Happens After You Report

1. We confirm receipt and try to reproduce the issue.
2. We agree a disclosure timeline with you. Ninety days is the default; a shorter one is fine when the issue is already public.
3. We fix it, publish the fix, and credit you in the advisory unless you would rather stay anonymous.

## Credentials and Local Data

Several components read credentials and local data from your machine. None of it is transmitted anywhere by this project.

- `mcp-cms` reads S3 credentials from a local `.env` file whose path you pass through `DOTENV_CONFIG_PATH`
- `read_google_doc` reads a Google service account key from the path in `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, and is not registered as a tool when that variable is unset
- `mcp-trail` and the Anytime Trail extension read SQLite databases under `.anytime/` in your workspace, which contain your AI session history
- the Anytime Agent extension reads Claude Code and Codex session files from your home directory

`.gitignore` excludes `.env*` (except `*.example`), `*service-account*.json`, and `*.pem` so these do not reach a commit by accident. If you find a path where this project writes a credential, a session transcript, or workspace content somewhere it should not — a log file, a bundled artifact, an outbound request — that is in scope and worth reporting.
