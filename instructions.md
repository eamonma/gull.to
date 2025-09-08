# gull.to Redirect System — **Master Implementation Guide (Standalone)**

> **Owner/DRI:** _TBD_ > **Repo:** `eamonma/gull.to` (default branch: `main`)
> **Audience:** You + anyone helping you ship and run this.
> **Status:** Ready to implement; all decisions reflect your current state and preferences.

---

## 0) Purpose & Current State

**Goal**
Enable `https://gull.to/g/{alpha4}` to redirect to the canonical **Birds of the World** species page for the given 4-letter alpha code—while continuing to use the domain for other link shortening needs.

**Today**

- `gull.to` is already on **Cloudflare**.
- The apex points to **Short.io** (currently via an **A record** to Short.io’s endpoint).
- You want to keep Short.io as the catch-all for everything **except** `/g/*`, and you’re open to adding a **DIY namespace** for personal links using GitOps.

**Chosen approach (routing model)**

- Put `gull.to` behind Cloudflare (already true).
- Add a **Cloudflare Worker route** for **`gull.to/g/*`**.
- The Worker handles `/g/*`; **all other paths fall through** to Short.io unchanged.

**Why this works best for you**

- Minimal change to your current setup.
- Fast and reliable path for `/g/*`.
- No vendor **state** (no KV/DB) and no analytics overhead.
- Route creation/updates can be done **via CI/CD** (yes, Workers + Routes are deployable with Wrangler/API from GitHub Actions).

---

## 1) Principles

- **Longevity > features:** Links should survive taxonomy/vendor changes.
- **Data over code:** The 4-letter → eBird 6-letter mapping ships as versioned data in Git (no runtime store).
- **No vendor state:** Embrace Cloudflare routing and analytics; avoid KV/DB for now.
- **Simple first, observable enough:** Minimal metrics (totals, successes, unknowns, latency). No alerts initially.
- **Evolvable contract:** Namespaced paths let us add more mappers later without breaking `/g/*`.

---

## 2) Requirements

### Functional Requirements (FRs)

**FR-1 — Namespace contract**

- Paths follow `/{ns}/{key}`.
- **Active namespace:** `/g/{alpha4}` (case-insensitive 4 letters A–Z).
- For `/g/*`: **ignore query strings**, **ignore trailing slash**.
- _Why:_ Keeps `/g/*` deterministic and leaves room for future namespaces.

**FR-2 — Normalization & validation**

- Normalize `{alpha4}` to **UPPERCASE**; must match `^[A–Z]{4}$`.
- Reject anything else.
- _Why:_ Prevents ambiguity and accidental misuse.

**FR-3 — Deterministic resolution**

- `alpha4 → ebird6 → BOW URL`.
- Destination template: `https://birdsoftheworld.org/bow/species/{ebird6}`.
- _Why:_ BOW pages key off eBird 6-letter slugs; this separation keeps logic clear.

**FR-4 — Redirect semantics**

- Use **302** (temporary) with `Cache-Control: private, max-age=0`.
- _Why:_ Avoid sticky browser caches; lets mapping fixes take effect immediately.

**FR-5 — Unknown handling**

- If `{alpha4}` is unmapped: **302 to** `https://birdsoftheworld.org/` (BOW home).
- _Why:_ Simpler than a help page; still lands users somewhere useful.

**FR-6 — Static mapping**

- Mapping lives in Git under `data/mapping/`, checked into the repo, and **bundled** with the Worker at deploy time.
- _Why:_ Zero runtime dependency; easy rollbacks; transparent diffs.

**FR-7 — Version disclosure**

- Add headers on every `/g/*` response:

  - `X-Gull-Worker: vMAJOR.MINOR.PATCH`
  - `X-Gull-Map: YYYY.MM[.DD][-hotfix.N]`

- _Why:_ Immediate traceability when testing or debugging.

**FR-8 — Diagnostics (enable now)**

- `/g/_health` → “ok” + worker/map versions.
- `/g/_meta/{alpha4}` → normalized input + resolved details (no secrets).
- _Why:_ Speeds up incident triage.
- **Rate-limit:** _Not required now_ (you explicitly said “no”), but can be added later if abused.

**FR-9 — Observability (minimal)**

- Use Cloudflare’s native analytics/logs only. Track: **totals, successes, unknowns, p95/p99 latency**.
- No external logging stack; **no alerts** initially.
- _Why:_ Enough signal with near-zero complexity/cost.

**FR-10 — Environments & staging**

- **Prod:** `gull.to`
- **Staging:** `staging.gull.to` (proxied via Cloudflare; has its own `/g/*` route).
- **Dev:** _Not needed_ (use Wrangler previews + local).
- _Why multiple?_\* Because staging gives you a safe mirror of prod for map or logic changes. Dev previews cover local/testing needs without another subdomain.\_

**FR-11 — Rollback & kill switch**

- Primary rollback: **redeploy previous tag** (your preference).
- Emergency bypass: remove the `/g/*` route so traffic falls through to Short.io.
- _Why:_ Predictable and fast recovery.

**FR-12 — Governance**

- Maintain ADRs (routing/namespaces; redirects/caching; mapping source & cadence).
- Maintain a single `CHANGELOG.md` capturing Worker + Map changes.
- _Why:_ Shared memory and clean provenance.

### Non-Functional Requirements (NFRs)

- **Availability:** ≥ 99.9% monthly for `/g/*`.
- **Performance:** p95 TTFB ≤ 100 ms; p99 ≤ 200 ms at the edge.
- **Scalability:** Handle 10× spikes without config changes.
- **Cost:** Fit Cloudflare free/low tier; no paid databases.
- **Portability:** Code/data portable; vendor features OK when they add no **state**.
- **Maintainability:** Map updates ≤ 15 minutes end-to-end.
- **Observability quality:** Metrics/logs present for ≥ 99.5% of requests; no PII.
- **Security:** Destination strictly templated; no open redirects; diagnostics are read-only.
- **Data integrity:** Mapping schema enforced; unique keys; template-safe destinations.
- **Testability:** Golden tests + synthetic probes must pass before prod.

---

## 3) Architecture

```
Client → Cloudflare Edge
  ├─ Route match: gull.to/g/*  → Worker
  │    └─ Load in-bundle static map → resolve → 302 to BOW
  └─ No match                   → Origin (Short.io) handles everything else
```

- **No** runtime datastore (no KV/DB).
- **DIY namespace (optional)**: Reserve `/l/*` for your personal GitOps links; start empty and add later without touching `/g/*`.

---

## 4) Data: Mapping & ETL

**Scope:** You prefer **global** coverage (“all preferably”).
**Source:** You believe there’s an **XLSX** with everything needed.

- **Action:** Put that XLSX in the repo (or provide a link) and run a lightweight **ETL** step in CI to produce the canonical JSON mapping.

**Canonical file**

- Location: `data/mapping/map-YYYY.MM.json` (bundled with the Worker).
- Schema (fields):

  - `alpha4` (UPPERCASE, `^[A-Z]{4}$`)
  - `ebird6` (lowercase, `^[a-z]{6}$`)
  - `common_name` (string)
  - `scientific_name` (string)
  - `source` (string, e.g., “XLSX <name>”)
  - `source_version` (string)
  - `updated_at` (ISO date)

**Validation rules**

- Unique `alpha4`.
- `ebird6` must render a valid destination via the **BOW template**.
- No extra fields.

**Cadence:** **On-demand** (your preference).
**Unknown target:** `https://birdsoftheworld.org/` (home).
**Golden codes (for tests):**
`AMCR, NOCA, MALL, CANG, RTHA, HOSP, BLJA, HAWO, BCCH, TUVU, COHA, AMRO`
_(These are common NA codes; you can add/edit anytime.)_

**Why ETL in CI?**

- Keeps XLSX as your editable “source of truth” while shipping a compact JSON to the edge.
- Enforces schema/uniqueness automatically.
- No manual JSON hand-editing.

---

## 5) Versions & Releases

- **Worker:** **SemVer** (`vMAJOR.MINOR.PATCH`) for runtime changes.
- **Map:** **CalVer** (`YYYY.MM[.DD]`, optional `-hotfix.N`) for data refreshes.
- **Tag format:** `release/worker-vX.Y.Z-map-YYYY.MM` (you confirmed).
- **Expose versions** in headers (`X-Gull-Worker`, `X-Gull-Map`) and in logs.

---

## 6) Environments, DNS & Routes

**Prod**

- Keep your current apex pointing to Short.io.
- Add a **Cloudflare Worker route** for `gull.to/g/*`.
- Worker intercepts only `/g/*`; all other paths continue to Short.io.

**Staging**

- Create `staging.gull.to` (proxied).
- Add a **staging route**: `staging.gull.to/g/*` → same Worker, staging env.

**Dev**

- Use Wrangler previews + local dev. **No separate dev subdomain** needed.

**CI/CD-managed routes?**

- **Yes.** Use Wrangler (via GitHub Actions) to apply routes per environment so no manual clicks are required. Routes live in config and get applied on deploy.

---

## 7) CI/CD (GitHub Actions) — What Runs

**Triggers**

- PR to `main`: validate + deploy to **staging**.
- Tag `release/worker-vX.Y.Z-map-YYYY.MM`: promote to **prod**.

**Pipeline stages**

1. **ETL (if XLSX present):** Build `map-YYYY.MM.json` from XLSX.
2. **Validate mapping:** Schema check, uniqueness, destination template safety.
3. **Golden tests:** Resolve the golden alpha4 set to proper BOW URLs.
4. **Build:** Bundle Worker + `map-YYYY.MM.json`; embed version headers.
5. **Deploy to staging:** Attach route `staging.gull.to/g/*`.
6. **Synthetic checks (staging):** Sample requests for success/unknown; verify 302 and latency budgets.
7. **Manual approval (Prod):** Use GitHub Environment protection.
8. **Promote to prod:** Attach route `gull.to/g/*`.
9. **Release notes:** Update `CHANGELOG.md`; push tag.

---

## 8) Observability (Minimal)

- **Tooling:** Cloudflare Analytics/Logs only.
- **Track:** total requests, successes, unknowns, p95/p99 latency.
- **No alerts** right now.
- **Privacy:** No PII; keep logs sparse.
- **On-response headers:** `X-Gull-Worker`, `X-Gull-Map` for fast, self-serve debugging.

---

## 9) Security & Abuse

- **No open redirects:** Destination is always the **templated BOW URL** from the mapping; no arbitrary host.
- **Strict input:** `/g/*` only allows `[A–Z]{4}` after normalization.
- **Diagnostics:** `/g/_health` and `/g/_meta/{alpha4}` are **read-only**; you chose **no rate-limit** now—monitor and add one later if needed.
- **Headers/HSTS:** Managed via Cloudflare; nothing special required now.

---

## 10) Performance & Traffic

- You marked traffic specifics as **not important right now**.
- We’ll hold the default NFR budgets: **p95 ≤ 100 ms**, **p99 ≤ 200 ms**.
- As usage grows, revisit synthetic check sizes and retention.

---

## 11) Runbook

### A) Update the mapping (on-demand)

1. Add/replace the **XLSX** source (if you keep XLSX as the master), or edit the JSON map directly.
2. Bump the **Map CalVer** (e.g., `2025.09` or `2025.09-hotfix.1`).
3. Open a PR to `main`.
4. CI runs: ETL (if XLSX), validate, tests → deploy to **staging**.
5. Confirm synthetic checks.
6. Approve **prod**; CI updates route and deploys.
7. Tag release; update `CHANGELOG.md`.

### B) Update Worker behavior

1. Bump **Worker SemVer**.
2. PR → CI (tests) → staging deploy → synthetic checks → approve → prod.
3. Tag & `CHANGELOG.md`.

### C) Rollback

- **Preferred**: redeploy previous **release tag** (your choice).
- **Emergency**: remove `/g/*` route; Short.io handles everything.

### D) Health/Debug

- Hit `/g/_health` to read versions.
- Use `/g/_meta/{alpha4}` to see how a code resolves.
- Check Cloudflare Analytics for unknown rate or latency spikes.

---

## 12) DIY Namespace for Personal Links (Optional Now)

- Reserve `/l/*` for your personal short links.
- **Storage model:** **GitOps** (your choice) — keep a `data/links.json` and bundle it like the map.
- **Why now:** Lets you try a DIY shortener without touching Short.io; if you like it, you can migrate later.

---

## 13) Documentation & Governance

- **ADRs**

  - ADR-001: Routing & Namespaces (why Option B; why `/g/*` is strict).
  - ADR-002: Redirects & Caching (why 302; cache headers; no edge caching).
  - ADR-003: Mapping Source & Cadence (XLSX → JSON via ETL; on-demand updates; provenance).

- **CHANGELOG**

  - Each entry must list Worker changes and Map diffs (adds/renames/removals).

---

## 14) Acceptance Criteria (Definition of Done)

- `/g/AMCR` and other **golden codes** 302 correctly to BOW on **staging** and **prod**.
- Unknown code (e.g., `/g/XXXX`) 302 to BOW **home**.
- Responses include **`X-Gull-Worker`** and **`X-Gull-Map`**.
- **p99 TTFB ≤ 200 ms** during synthetic checks.
- **Rollback** procedure validated (previous tag redeployed once during setup).
- ADRs created and **CHANGELOG** updated with the initial release.
