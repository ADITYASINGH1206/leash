# Contributing to Leash

Thank you for contributing to **Leash: Payment Firewall for AI Agents**. This document outlines our branch conventions, PR requirements, code standards, and testing rules.

---

## 🔀 Branching Strategy & PR Workflow

1. **Main Branch Protection:**
   - The `main` branch is protected. Direct pushes are blocked.
   - All code must enter via Pull Request.
   - At least 1 review is required.

2. **Branch Naming Conventions:**
   - Features: `feat/<feature-name>` (e.g., `feat/intent-judge-schema`)
   - Bug Fixes: `fix/<bug-name>` (e.g., `fix/nonce-replay-validation`)
   - Infrastructure & Docs: `chore/<description>` (e.g., `chore/render-env-config`)

3. **Commit Messages:**
   Follow Conventional Commits:
   ```text
   feat(mandates): implement RFC 8785 canonicalisation and ES256 verification
   fix(gateway): resolve deadlock on parallel mandate budget reservation
   docs(threat-model): add indirect prompt injection mitigation matrix
   ```

---

## 🤖 Automated Gemini AI PR Reviewer

Every Pull Request opened or updated triggers the **Gemini AI PR Reviewer** (`.github/workflows/gemini-pr-review.yml`):
- Analyzes code diffs against the Leash architecture and security threat model.
- Verifies:
  - Authorize-then-capture enforcement
  - Fail-closed error handling
  - Quarantined intent context (no raw external web HTML to LLMs)
  - Atomic database budget locking (`SELECT FOR UPDATE`)
  - Secrets & credentials protection
- Posts an architectural summary and creates interactive inline code suggestions on modified lines.

To trigger a re-review manually on an existing PR, comment:
```text
/review
```

---

## 🧪 Testing Requirements

- **Unit & Integration Tests:** Every new package or route must include comprehensive tests using `vitest` or `pytest`.
- **Pre-PR Verification:**
  ```bash
  # Check formatting and linting
  pnpm lint
  
  # Run all test suites
  pnpm test
  ```
- **Never Hardcode Secrets:** Never commit `.env` files, API keys, PayPal client secrets, or private keys.
