#!/usr/bin/env python3
"""Leash: Payment Firewall for AI Agents — Gemini AI PR Reviewer.

Reviews pull request diffs against Leash architecture, security threat models,
and institutional safety invariants using the Google Gemini API.
Runs in GitHub Actions with zero external Python dependencies.
Idempotently updates existing review comments and posts inline code suggestions.
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

EXCLUDE_EXTENSIONS = (
    ".lock",
    "-lock.json",
    ".min.js",
    ".min.css",
    ".map",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".npz",
    ".npy",
    ".pt",
    ".safetensors",
    ".parquet",
    ".pdf",
)

PROMPT_TEMPLATE = """You are an expert senior software architect, financial systems engineer, and AI safety auditor evaluating a Pull Request for **Leash: Payment Firewall for AI Agents** (PayPal AI Hackathon 2026).
Leash is an institutional payment firewall that intercepts autonomous AI agent transactions, verifying cryptographic mandates and routing through a 5-layer deterministic and AI inspection engine before authorizing funds on PayPal rails.

Review the following Pull Request diff thoroughly against our project specifications and standards.

### CRITICAL PROJECT RULES & ARCHITECTURAL INVARIANTS:
1. **Authorize-Then-Capture Invariant:** Money must NEVER move immediately at purchase time. An authorization reserves funds (`intent: AUTHORIZE`); capture occurs ONLY when the merchant posts a verified fulfilment notice. Auto-void runs after 72 hours if unfulfilled.
2. **Fail-Closed Principle:** Any layer failure, network timeout (> 2.5s), DB collision, or unhandled exception in the decision engine MUST result in a `HOLD` for human review. It must NEVER default to `ALLOW`.
3. **Quarantined Intent Context:** The Intent Judge LLM must NEVER ingest raw external web HTML or unparsed tool outputs. Agent rationales must be treated as adversarial claims, capped at 500 characters, and strictly quarantined.
4. **Cryptographic Mandate Integrity:** Mandates must be canonically encoded per RFC 8785 before signing/verifying with ECDSA P-256 (ES256). Budget reservations must use row-level database mutex locks (`SELECT ... FOR UPDATE`) to prevent concurrent race conditions.
5. **Deterministic Policy as Code:** High-risk actions (gift cards, crypto, money transfers, extreme velocity, off-hours) must be enforced deterministically via CEL / JSONLogic rules rather than fuzzy LLM prompts alone.
6. **Immutable Hash-Chained Ledger:** Every event (mandate, request, layer verdicts, authorization, capture, void) must be recorded in an append-only table where each row's hash is `SHA-256(prev_hash + canonical_json(payload))`.
7. **Secrets & Credentials Protection:** PayPal Client Secrets, Vault Tokens, Webhook Verification Secrets, VAPID Private Keys, or LLM API keys must NEVER be committed to Git, exposed to clients, or printed in unmasked logs.
8. **Testing & Parity:** All new API endpoints, decision layers, cryptographic tools, and business logic must include unit tests (Vitest / pytest) and pass without regressions.

---

### PR METADATA:
- **PR Number:** #{pr_number}
- **Title:** {pr_title}
- **Author:** @{pr_author}

---

### CODE DIFF:
```diff
{diff_content}
```

---

### REQUIRED OUTPUT FORMAT:
Produce a comprehensive, highly readable GitHub Markdown review following this structure:

<!-- leash-firewall-pr-review -->
## 🛡️ Leash Firewall AI Architecture & Security Review

| Status | Target PR | Author | Review Engine |
| :--- | :--- | :--- | :--- |
| **[VERDICT_BADGE: ✅ APPROVE | ⚠️ COMMENT | ❌ REQUEST CHANGES]** | #{pr_number} - {pr_title} | @{pr_author} | Google Gemini AI Safety |

---

### 📋 1. Executive Summary
(Provide a clear 2-4 sentence architectural summary of what this PR introduces, changed components, and overall impact on Leash)

---

### 🔒 2. Safety & Policy Compliance Checklist

| Rule / Architectural Invariant | Status | Details / Audit Finding |
| :--- | :---: | :--- |
| **Authorize-Then-Capture Enforced** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |
| **Fail-Closed Error Handling** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |
| **Quarantined Intent Context (No Raw Web)** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |
| **Cryptographic & Budget Mutex Integrity** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |
| **Deterministic Policy CEL Rules** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |
| **Tamper-Evident Ledger Hashing** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |
| **Secrets & Credential Protection** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |
| **Unit & Integration Test Coverage** | [✅ Pass | ⚠️ Warning | ❌ Fail] | (Details) |

---

### 🔍 3. Deep Technical Findings & Vulnerability Analysis
(Group findings clearly by severity with exact file paths, line references, explanation, and code fixes):

#### 🔴 [BLOCKING] Issues (Must resolve before merge)
(List each blocking flaw with path and explanation. If none, state "None detected.")

#### 🟡 [WARNING] Architectural & Code Quality Improvements
(List improvements, edge cases, potential race conditions, or error handling gaps. If none, state "None detected.")

#### 🟢 [VERIFIED] Strengths & Positive Highlights
(List what was done exceptionally well in this PR: modularity, typing, clean algorithms, etc.)

---

### 💡 4. Actionable Next Steps
(List 2-4 concrete, prioritized bullet points for the author to address before merge)

> ⚠️ **Financial Safety Notice:** Autonomous AI agents must never possess unconstrained spending authority. All transactions must be bounded by cryptographic mandates and verified through the 5-layer firewall.

---

### 5. Inline Actionable Suggestions (FOR CONVERSATIONS)
At the very end of your response, output a single JSON code block tagged ````inline-suggestions```` containing specific code corrections for lines changed in the diff.
The JSON must follow this exact schema:
```inline-suggestions
[
  {
    "path": "apps/gateway/src/routes/payment.ts",
    "line": 42,
    "severity": "BLOCKING",
    "title": "Missing atomic budget lock",
    "comment": "Wrap budget deduction in a database transaction with SELECT FOR UPDATE to prevent concurrent spending races.",
    "suggestion": "const mandate = await db.select().from(mandates).where(eq(mandates.id, mandateId)).for('update');"
  }
]
```
If there are no inline suggestions, output:
```inline-suggestions
[]
```
"""


def get_pr_diff(pr_number: str) -> str:
    """Retrieve filtered pull request diff using git commands."""
    try:
        subprocess.run(
            ["git", "fetch", "origin", f"pull/{pr_number}/head:pr-{pr_number}"],
            check=True,
            capture_output=True,
            text=True,
        )
        base_ref = os.environ.get("GITHUB_BASE_REF", "main")
        cmd = ["git", "diff", f"origin/{base_ref}...pr-{pr_number}"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        raw_diff = result.stdout
    except Exception as e:
        print(f"Git diff failed: {e}. Falling back to gh pr diff...")
        try:
            result = subprocess.run(
                ["gh", "pr", "diff", str(pr_number)],
                capture_output=True,
                text=True,
                check=True,
            )
            raw_diff = result.stdout
        except Exception as e2:
            print(f"gh pr diff failed: {e2}")
            return "No diff detected."

    if not raw_diff.strip():
        return "No diff detected."

    filtered_lines = []
    current_file_excluded = False

    for line in raw_diff.splitlines():
        if line.startswith("diff --git"):
            current_file_excluded = any(
                line.endswith(ext) or f"{ext} " in line for ext in EXCLUDE_EXTENSIONS
            )
        if not current_file_excluded:
            filtered_lines.append(line)

    diff_text = "\n".join(filtered_lines)
    # Truncate if diff is exceptionally large (> 60,000 characters)
    if len(diff_text) > 60000:
        diff_text = diff_text[:60000] + "\n\n... [Diff truncated for context limits] ..."

    return diff_text


def get_pr_head_sha(pr_number: str) -> str:
    """Retrieve the latest commit SHA for the PR."""
    sha = os.environ.get("PR_HEAD_SHA")
    if sha and sha.strip():
        return sha.strip()

    try:
        res = subprocess.run(
            ["gh", "pr", "view", str(pr_number), "--json", "headRefOid", "-q", ".headRefOid"],
            capture_output=True,
            text=True,
            check=True,
        )
        if res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass

    repo = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if repo and token:
        try:
            api_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"
            req = urllib.request.Request(
                api_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("head", {}).get("sha", "")
        except Exception:
            pass

    return ""


def call_gemini(prompt: str, api_key: str) -> str:
    """Call Google Gemini API with automatic model fallback."""
    models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    last_err = None

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 8192,
            },
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        for attempt in range(2):
            try:
                print(f"Attempting review with {model} (attempt {attempt + 1})...")
                with urllib.request.urlopen(req, timeout=60) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    text = resp_data["candidates"][0]["content"]["parts"][0]["text"]
                    return text
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                print(f"HTTPError with {model}: {e.code} - {err_body[:200]}")
                last_err = e
                time.sleep(2)
            except Exception as e:
                print(f"Error calling {model}: {e}")
                last_err = e
                time.sleep(2)

    raise RuntimeError(f"All Gemini models failed. Last error: {last_err}")


def extract_inline_suggestions(review_text: str):
    """Extract inline suggestions JSON block from markdown."""
    pattern = r"```inline-suggestions\s*([\s\S]*?)\s*```"
    match = re.search(pattern, review_text)
    suggestions = []
    cleaned_review = review_text

    if match:
        json_str = match.group(1).strip()
        try:
            suggestions = json.loads(json_str)
        except Exception as e:
            print(f"Failed to parse inline suggestions JSON: {e}")
        cleaned_review = review_text[: match.start()].rstrip() + review_text[match.end() :]

    return cleaned_review.strip(), suggestions


def post_or_update_github_comment(pr_number: str, comment_body: str):
    """Idempotently post or update the review comment on the PR."""
    marker = "<!-- leash-firewall-pr-review -->"
    repo = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

    if not repo or not token:
        print("Warning: GITHUB_REPOSITORY or GITHUB_TOKEN missing. Using gh CLI...")
        subprocess.run(["gh", "pr", "comment", str(pr_number), "--body", comment_body], check=True)
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    }

    # Check for existing comment
    comments_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
    req = urllib.request.Request(comments_url, headers=headers)
    existing_comment_id = None

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            comments = json.loads(resp.read().decode("utf-8"))
            for c in comments:
                if marker in c.get("body", ""):
                    existing_comment_id = c["id"]
                    break
    except Exception as e:
        print(f"Could not fetch existing comments: {e}")

    payload = json.dumps({"body": comment_body}).encode("utf-8")

    if existing_comment_id:
        update_url = f"https://api.github.com/repos/{repo}/issues/comments/{existing_comment_id}"
        req = urllib.request.Request(update_url, data=payload, headers=headers, method="PATCH")
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"Successfully updated review comment #{existing_comment_id}")
    else:
        req = urllib.request.Request(comments_url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"Successfully posted new review comment on PR #{pr_number}")


def post_inline_review_comments(pr_number: str, head_sha: str, suggestions: list):
    """Post inline conversation comments on modified lines."""
    repo = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not repo or not token or not head_sha or not suggestions:
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    }

    # Fetch existing inline review comments
    existing_coords = set()
    try:
        url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/comments"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            comments = json.loads(resp.read().decode("utf-8"))
            for c in comments:
                path = c.get("path")
                line = c.get("line") or c.get("original_line")
                if path and line:
                    existing_coords.add((path, int(line)))
    except Exception as e:
        print(f"Could not fetch existing inline comments: {e}")

    severity_emojis = {"BLOCKING": "🔴", "WARNING": "🟡", "SUGGESTION": "💡"}
    posted_count = 0

    for item in suggestions:
        try:
            path = item.get("path")
            line = int(item.get("line", 0))
            if not path or not line or (path, line) in existing_coords:
                continue

            sev = item.get("severity", "WARNING").upper()
            emoji = severity_emojis.get(sev, "🔍")
            title = item.get("title", "Review Finding")
            comment = item.get("comment", "")
            suggestion = item.get("suggestion", "")

            body_parts = [f"### {emoji} {title}\n", f"{comment}\n"]
            if suggestion:
                body_parts.append(f"```suggestion\n{suggestion}\n```")

            post_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/comments"
            payload = json.dumps({
                "body": "\n".join(body_parts),
                "commit_id": head_sha,
                "path": path,
                "line": line,
                "side": "RIGHT",
            }).encode("utf-8")

            req = urllib.request.Request(post_url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=15) as r:
                print(f"Created inline suggestion on {path}:{line}")
                existing_coords.add((path, line))
                posted_count += 1
        except Exception as e:
            print(f"Skipping inline comment on {path}:{line}: {e}")

    print(f"Posted {posted_count} inline suggestions.")


def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable is not set.")
        sys.exit(1)

    pr_number = os.environ.get("PR_NUMBER")
    pr_title = os.environ.get("PR_TITLE", "Pull Request Review")
    pr_author = os.environ.get("PR_AUTHOR", "contributor")

    if not pr_number:
        event_path = os.environ.get("GITHUB_EVENT_PATH")
        if event_path and os.path.exists(event_path):
            with open(event_path) as f:
                event_data = json.load(f)
                pr_info = event_data.get("pull_request") or event_data.get("issue", {})
                pr_number = str(pr_info.get("number", ""))
                pr_title = pr_info.get("title", pr_title)
                pr_author = pr_info.get("user", {}).get("login", pr_author)

    if not pr_number:
        print("Error: No PR number detected.")
        sys.exit(1)

    print(f"Reviewing PR #{pr_number}: '{pr_title}' by @{pr_author}...")
    diff = get_pr_diff(pr_number)

    if diff == "No diff detected.":
        print("No changes found in diff to review.")
        return

    prompt = (
        PROMPT_TEMPLATE.replace("{pr_number}", str(pr_number))
        .replace("{pr_title}", pr_title)
        .replace("{pr_author}", pr_author)
        .replace("{diff_content}", diff)
    )

    print("Sending diff to Gemini API for financial safety review...")
    review = call_gemini(prompt, api_key)
    cleaned_review, suggestions = extract_inline_suggestions(review)

    post_or_update_github_comment(pr_number, cleaned_review)
    if suggestions:
        head_sha = get_pr_head_sha(pr_number)
        post_inline_review_comments(pr_number, head_sha, suggestions)


if __name__ == "__main__":
    main()
