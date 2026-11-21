# Final three improvements — v3.7.0

Source plan: the three recommendations in this chat, explicitly approved by the user. No extra CRM, auto-sending, analytics or provider additions. ECC TDD and verification guidance used. Existing MV3 architecture retained.

## User journeys and execution

1. Find and resume a final edited recipient draft, rather than lose it after five recipients. Implemented 20-draft retention, name/company search, metadata, compact expandable previews, Open/Edit and honest Copy.
2. Delete unwanted drafts and undo a mistake without overwriting other work. Worker-serialized delete/undo; active draft cleared, 30-second Undo while popup remains open, newer-version conflict protection. Undo does not imply a LinkedIn action.
3. Reach a useful draft with fewer controls and an intentional project choice. Recipient editing collapses after reading, remaining checkbox removed, longer guidance disclosed progressively. Compose selects one exact saved reviewed highlight, Auto, or introduction only. Selection persists; stale/unreviewed selection rejected before API calls. Existing wording stays unchanged until generation.

## RED evidence before implementation

`npm.cmd test` executed 67 tests: 61 passed, six failed. Intended failures included 20-vs-5 retention, unknown delete action, unused selected project, accepted unreviewed selection, and missing `Writer.highlightChoices` / `Writer.selectHighlights` functions.

`node tests/final-polish.cjs` failed at the user-visible removal test: `#recipient-reviewed` count was 1, expected 0. No production code was changed before these failures were observed. A later old regression expected full Recent text to be expanded; updated it to expand the new preview before checking final edited text.

A repeat run exposed a timing assumption in the new search test (checking card count before asynchronous rendering). Changed the test to wait for observable results and saved status, not a fixed delay. Two consecutive eight-journey runs then passed.

## GREEN evidence

| Guarantee | Evidence | Result |
|---|---|---|
| Latest 20 distinct recipients retained, oldest evicted; legacy records receive stable IDs | `tests/background.test.cjs` | PASS |
| Delete clears active Current and Recent; Undo restores exact edits and chosen highlight | `tests/background.test.cjs`, `tests/final-polish.cjs` | PASS |
| Wrong/expired Undo token and newer-version conflict cannot overwrite text | `tests/background.test.cjs` | PASS |
| Search by name/company, empty search results, Clear search and compact previews | `tests/final-polish.cjs` | PASS |
| Copy uses final wording and never claims sending; Open/Edit saves corrections | `tests/final-polish.cjs` | PASS |
| No recipient checkbox; editing remains available; help defaults collapsed | `tests/final-polish.cjs` | PASS |
| Selected reviewed project alone becomes highlighted local/cloud context; qualifiers preserved | `tests/writer.test.cjs`, `tests/background.test.cjs` | PASS |
| Unreviewed/stale choice blocked, no fetch; introduction-only fallback and recovery work | logic tests and final-polish browser | PASS |
| Existing extraction, PDF, tone, rewrite, error, privacy and 400px sizing paths remain | `tests/browser.cjs`: 36 checks | PASS |
| Five providers, saved keys, same-ID developer reload and browser restart remain | `tests/key-recovery.cjs`: eight checks | PASS |

`npm.cmd test`: **72/72 logic tests passed**. `tests/final-polish.cjs`: **eight browser journeys passed**, zero page errors. All browser tests use actual unpacked MV3 code in isolated Chromium. LinkedIn fixture/API transport is mocked in offline suites. This is not installed Edge acceptance.

Live Groq and Gemini: six actual API/browser checks each passed in v3.7, using only built-in fictional Avery Demo/Jordan Example and an explicitly selected RAG project. Generation, shorter rewrite, Undo and recovery passed. No real profile/resume, no Claude/OpenAI/NVIDIA live call this pass. See `multi-provider-live.json`. API output still needs factual review; source matching is not a truth guarantee.

## Coverage and other gates

Coverage command actually run:

`node --test --experimental-test-coverage --test-coverage-exclude="tests/**" tests/core.test.cjs tests/background.test.cjs tests/writer.test.cjs tests/providers.test.cjs`

Source filenames were added to VM execution so real application scripts are measured, not just test files. Node-loaded application subset (background, credentials, outreach, providers, writer): **97.76% lines, 81.69% branches, 93.26% functions**. Popup, scraper, cache and PDF adapter are exercised through browser journeys but are NOT included in that percentage. No whole-extension coverage claim.

Nine first-party JS/MJS syntax checks pass. Build/TypeScript/lint: no separate configuration/framework build. At the time of this implementation verification, the workspace was not yet a Git repository; no TDD checkpoint ancestry is claimed. Git was initialized and the source published afterward. Manual changed-file review covers worker history writes, exact fact selection, DOM text-only rendering, race controls, key isolation and legacy draft handling. Package scanner compares source bytes against private env values/key-like patterns. Only extension files go into ZIP.

Undo is transient (30 seconds, current popup/worker), not a recycle bin. Twenty entries means one current final draft per recipient, not twenty versions. Already-evicted old five-item history cannot be recovered. Date labels use browser locale/timezone. No automatic sending or copied-as-sent inference.

## Target and handoff

Local checks PASS; isolated Chromium UI, developer reload/browser restart and Groq/Gemini API acceptance VERIFIED. Installed Edge v3.7 acceptance NOT PERFORMED. Next step: Reload the same installed folder, refresh LinkedIn, confirm v3.7.0; do not Remove/reinstall/change folder. Existing remembered keys should persist with the same extension identity. Record/publish the user's Loom and submit; no email or Loom publication was performed by the agent.
