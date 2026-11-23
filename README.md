# XAgent — Advanced AI Assistant

A full AI agent web app: multi-mode AI chat with built-in tools, chat history,
and a provider chain that **works out of the box with no API key**.

**Live:** deployed on Vercel from this repo.

## Features

- **4 expert modes** — General Assistant, Coding Expert, Urdu Dost (Roman Urdu), Business Advisor
- **Built-in tools** (executed server-side, verified results):
  - Calculator — full math expressions, `sqrt`, powers, brackets
  - Unit converter — length, weight, temperature, data, time
  - Live date & time (Pakistan / UTC)
- **Chat history** — multiple chats, saved in the browser, export to .txt, delete
- **Markdown + code blocks** with copy button, typing effect, stop button
- **Health endpoint** — the UI shows live "AI Online" status from `/api/health`
- **No dead ends** — if the backend is unreachable, the front-end falls back to a direct AI call

## How the AI works

`api/chat.js` tries providers in order:

1. **OpenAI** — if `OPENAI_API_KEY` is set (model via `OPENAI_MODEL`, default `gpt-4o-mini`)
2. **Google Gemini** — if `GEMINI_API_KEY` is set (model via `GEMINI_MODEL`, default `gemini-2.0-flash`)
3. **Free built-in provider** — no key needed (default)

To upgrade the AI, add a key in Vercel: Project → Settings → Environment Variables
(`OPENAI_API_KEY` or `GEMINI_API_KEY`), then redeploy.

## Project structure

```
index.html      — the whole front-end (single file, no build step)
api/chat.js     — AI endpoint: personas, tools, provider chain
api/health.js   — status endpoint used by the UI
vercel.json     — clean URLs + security headers
```

## Run locally

```bash
npx vercel dev
```

## Deploy

Push to GitHub and import the repo in Vercel — zero configuration needed.
Every push to `main` auto-deploys.
