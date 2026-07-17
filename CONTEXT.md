# Life OS — Project Context

## What this is
A mobile-first Progressive Web App — my personal command centre replacing how I currently use Claude.ai. Built around a consequence-based life management system across 7 buckets: Finance, Health, Work, Family, Home, Personal, Systems.

## The user
Yogesh — architect at Gensler. Building a personal operating system to manage all areas of life efficiently. Time is the scarcest resource. Accuracy over speed.

## Core function
- Chief of Staff home screen — weighted daily priority list across all buckets
- Task store in Supabase (app_data key: todoist_task_cache) — single source of truth
- Google Calendar integration
- Chat interface with persistent history
- Individual bucket views
- MCP server at /api/mcp for Claude Code integration

## Development roadmap
The roadmap lives in the task store (Supabase `todoist_task_cache`), not in code or
static docs. Each phase is a task with category "Roadmap Phase"; its features are the
subtasks parented under it. The Settings roadmap card renders this live, and progress is
computed from each subtask's real completion state. Phase names (aligned to the app):
1. Foundation
2. Intelligence
3. Connected Intelligence
4. Automation
5. Voice and Mobility
6. Full Autonomy

(Phase 2 is "Intelligence" — not "Active Agents".)

## Principles
- Accuracy over speed
- Functional and intuitive UI — Google Material Design aesthetic
- Mobile first
- Never invent data — if something isn't there, say so
- Consequence-based prioritisation — not date-based

## Build order
1. Scaffold ✓
2. Vercel deployment ✓
3. Supabase task store ✓
4. Chief of Staff home screen ✓
5. Bucket views ✓
6. Google Calendar ✓
7. Chat with persistent history ✓
8. MCP server for Claude Code ✓
9. PWA home screen install
