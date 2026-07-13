# Contributing to Corsen Context

Thank you for your interest in contributing to Corsen Context! This project is open source under the MIT license, and we welcome contributions of all kinds.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/CorsenAI/corsen-context.git
cd corsen-context

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Project Structure

This is a monorepo managed with pnpm workspaces and Turborepo.

| Package | Path | Language |
|---------|------|----------|
| Core library | `packages/core/` | TypeScript |
| Next.js adapter | `packages/nextjs-adapter/` | TypeScript |
| CLI | `packages/cli/` | TypeScript |
| WordPress plugin | `packages/wordpress-plugin/` | PHP |

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes in the relevant package(s)
3. Write or update tests (in `packages/core/tests/`)
4. Ensure all checks pass:

```bash
pnpm build       # Build all packages
pnpm lint        # ESLint
pnpm typecheck   # TypeScript type checking
pnpm test        # Run all tests
```

5. Ensure all tests pass and type checks succeed
6. Add a changeset for any user-facing change: `pnpm changeset`
7. Commit with a conventional commit message
8. Submit a pull request

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `chore:` — Tooling, CI, dependencies
- `refactor:` — Code changes that don't fix bugs or add features
- `test:` — Adding or updating tests

Examples:
- `feat: add Redis cache driver`
- `fix: handle empty sitemap response`
- `docs: add Astro integration guide`

## Code Style

- **TypeScript** for core, adapters, and CLI
- **PHP** for WordPress plugin (WordPress Coding Standards)
- All code, comments, and documentation in **English**
- Use Prettier for formatting (config in `.prettierrc`)

## Creating a New Adapter

Want to add support for a new framework? Here's the pattern:

1. Create `packages/your-adapter/` with `package.json`, `tsconfig.json`
2. Add `@corsenai/corsen-context` as a dependency
3. Import and use `CorsenContext` and `MCPServer` from the core
4. Implement framework-specific handlers for:
   - `POST /v1/mcp` — MCP JSON-RPC endpoint
   - `GET /llms.txt` — Static llms.txt
   - Handle `null` return from `handleRequest()` as `204 No Content` (notifications)
5. Add to `pnpm-workspace.yaml`
6. Add tests and a README
7. Submit a PR

See `packages/nextjs-adapter/` as a reference implementation.

## WordPress Plugin

The WordPress plugin is standalone PHP — it doesn't depend on the TypeScript packages at runtime. When making changes:

- Follow [WordPress Coding Standards](https://developer.wordpress.org/coding-standards/)
- Use `sanitize_text_field()`, `esc_html()`, `esc_url()` for all user input
- Use `$wpdb->prepare()` for database queries
- Check `current_user_can()` for admin actions
- Test with PHP 8.0+

## Reporting Issues

- Use the [Bug Report](https://github.com/CorsenAI/corsen-context/issues/new?template=bug_report.md) template for bugs
- Use the [Feature Request](https://github.com/CorsenAI/corsen-context/issues/new?template=feature_request.md) template for ideas

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Built by [Corsen AI](https://corsen.ai) — European AI, sovereign by design.
