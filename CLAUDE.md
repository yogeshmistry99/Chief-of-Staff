# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Session protocol

- **Read `STATUS.md` at the start of every session.** It is the single source of truth for
  system state — architecture, what's connected, where data lives, known bugs, recent
  changes, and traps. Do not re-diagnose things it already answers.
- **Update `STATUS.md` at the end of any session that changes system state** — new bugs,
  fixes, schema/storage changes, connection status, or anything a future session would
  otherwise have to rediscover. Add to "Recent significant changes" (dated, newest first)
  and refresh the relevant sections.
- **After updating `STATUS.md`, print a condensed version in chat** (~40 lines, no file
  paths or code references) covering architecture, connections, data locations, open bugs,
  recent changes, and traps. This gets pasted into the Life OS knowledge base.

## Project

Vite + React 19 PWA (mobile-first) on Vercel, with `/api/*` serverless functions, Supabase
for persistence, and an MCP server at `/api/mcp` exposing tools to Claude.ai. See `STATUS.md`
for the full picture and `CONTEXT.md` for product intent.
