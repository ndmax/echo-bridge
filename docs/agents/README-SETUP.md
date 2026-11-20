# Minimal Echo Bridge — Codex starter

This starter contains instructions for Codex, not an already implemented Alexa application.

**MP3 assumption:** You already have a permanent, publicly accessible HTTPS MP3 URL, e.g. `https://media.example.com/sounds/doorbell.mp3`. This project accepts the **complete URL** as the playback input; it does not host, upload, retrieve, re-serve, or generate audio links. Whether Amazon will permit the bridge to initiate playback still needs real-device validation.

## Create the workspace

```bash
mkdir -p ~/Cloud/Tech/Codebase/echo-bridge
cd ~/Cloud/Tech/Codebase/echo-bridge
```

Copy `AGENTS.md`, `PROJECT_BRIEF.md`, `START_PROMPT.md`, and `.gitignore` here, then:

```bash
git init -b main
mkdir -p references
git clone --depth 1 https://github.com/tonesto7/echo-speaks.git references/echo-speaks
git clone --depth 1 https://github.com/tonesto7/echo-speaks-server.git references/echo-speaks-server
git clone --depth 1 https://github.com/ndmax/echo-speaks-ax-login-patch.git references/echo-speaks-ax-login-patch
git clone --depth 1 https://github.com/Apollon77/alexa-remote.git references/alexa-remote
git add AGENTS.md PROJECT_BRIEF.md START_PROMPT.md .gitignore
git commit -m "Add Codex brief and constraints"
```

If Git says the author identity isn't configured, set `git config user.name` and `git config user.email` for this repository and re-run `git commit`.

## Run Codex

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

Paste the text from `START_PROMPT.md` into the Codex session. Codex automatically reads `AGENTS.md` in the repository root. The other Markdown files are task-specific inputs.

`--ask-for-approval on-request` is particularly useful when Codex needs network access or wants to affect resources outside the workspace. Do not use `--yolo`/full-access mode for this repository.

## Validate the results

Review `docs/research.md`, `docs/feasibility.md`, and `docs/status.md` before approving live Amazon authentication or tests. Verify that zone tests assert **one Amazon outbound request** and that any MP3 playback claim has a corresponding real-speaker test **using a public HTTPS MP3 URL**. Do not approve media hosting or proxy features; hosting is already solved.

Your existing Echo Speaks integration should remain untouched until you decide to change over.
