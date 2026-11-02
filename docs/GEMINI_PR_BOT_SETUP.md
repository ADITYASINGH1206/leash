# Setting Up the Gemini AI PR Review Bot

Leash includes an automated Pull Request review bot powered by the Google Gemini API (`gemini-2.5-flash` / `gemini-2.0-flash` / `gemini-1.5-flash`). Whenever teammates open or update a Pull Request, the bot automatically reviews their code diff against the Leash architecture, checks security invariants (authorize-then-capture, fail-closed, DB budget mutex), and posts structured feedback along with inline code suggestions.

---

## 1. How It Works

```text
Teammate opens PR
       │
       ▼
GitHub Actions triggers `.github/workflows/gemini-pr-review.yml`
       │
       ▼
Script `scripts/gemini_pr_reviewer.py` computes filtered code diff
       │
       ▼
Sends diff + PR metadata + Leash invariants to Google Gemini API
       │
       ▼
Gemini analyzes code for:
- Compliance with Leash invariants & AGENTS.md rules
- Authorize-then-capture lifecycle enforcement
- Fail-closed error handling (no accidental ALLOW on error)
- Quarantined intent context (no raw external web HTML to LLMs)
- Atomic budget reservation mutex (`SELECT FOR UPDATE`)
- Cryptographic mandate canonicalisation (RFC 8785)
- Unit & integration test coverage
- Secret leakage & credential protection
       │
       ▼
1. Posts/updates the structured review comment on the PR
2. Posts inline suggestions as interactive GitHub conversations on modified code lines
```

---

## 2. One-Time Setup: Adding Your Gemini API Key

To activate the bot, add your Gemini API Key to GitHub Repository Secrets:

### Step 1: Get a Gemini API Key
1. Go to **[Google AI Studio](https://aistudio.google.com/)**.
2. Sign in with your Google account.
3. Click **"Get API key"** and create a new key (free tier is fully sufficient).

### Step 2: Add Secret to GitHub
1. Open your repository on GitHub: [`https://github.com/ADITYASINGH1206/leash`](https://github.com/ADITYASINGH1206/leash).
2. Go to **Settings** → **Secrets and variables** → **Actions**.
3. Click **"New repository secret"**.
4. Name: `GEMINI_API_KEY`
5. Value: paste your Gemini API key.
6. Click **"Add secret"**.

---

## 3. Triggering Re-Reviews

If you push updates to an existing PR, the bot runs automatically on synchronization. You can also manually trigger a review by commenting on the PR:
```text
/review
```
or
```text
/gemini
```
