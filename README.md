# Outreach AI — Ark Abroad

An incremental improvement to the supplied LinkedIn Outreach AI Chrome/Edge extension. Version **3.7.0** retains its Manifest V3 architecture: no framework rebuild, company backend, automatic sending or claimed web enrichment.

## What changed

- More careful profile extraction, source-labelled editable recipient details and a manual fallback.
- Local PDF résumé parsing with reviewed, selectable project/skill highlights. The PDF is not uploaded.
- Useful offline drafting in five tones, a specific outreach goal, connection-note/direct-message formats and adjustable writing budgets.
- Shorter, Warmer and More direct rewrites, exact Undo, autosaved edits and a searchable library of twenty final recipient drafts.
- Optional NVIDIA, Groq, Gemini, Claude and OpenAI writers with provider-specific keys/models, timeouts, clear errors and a labelled local fallback.
- Keys remembered on the device across same-identity reloads, with Forget controls and explicit cloud-sharing information.

## Install or update

1. Download/clone this repository. No npm installation is needed to run the extension.
2. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select **`linkedin extention`**, the existing folder containing `manifest.json` (original spelling retained). Do not select the repository root.
4. Open the extension, save your name/introduction in **Your context**, then visit a LinkedIn `/in/` profile and click **Read profile**.
5. Review/edit the details, choose a goal and a saved project, leave **Write with = Local**, then generate. Copy and send yourself; the extension never sends messages.

For updates, keep the SAME installed folder and extension identity, click **Reload**, then refresh LinkedIn. Removing/reinstalling or changing the unpacked path can create a different identity and lose access to existing storage. Confirm **v3.7.0** in the popup.

## How profile extraction works

The popup asks the background worker to read the active LinkedIn `/in/` tab. A content script reads the page DOM (HTML loaded in your browser), briefly scrolling to help LinkedIn load sections and then restoring your position. It does not call a private LinkedIn API or bypass access controls.

The script checks profile headings/page title for the name, cleans notification prefixes such as `(20)`, reads the headline and looks for dated current Experience entries. Explicit `at/@` headline text or a unique company link can supply separate fields; an ambiguous school/organisation label is not silently treated as employment. About/Skills are collected when available. Missing or hidden information may remain empty and can be entered manually.

The popup shows source labels. A headline-derived role and a separate company link do **not** prove employment. Only the selected writing context is passed on to drafting; collected About/Skills and profile URL are not sent in cloud prompts.

## Privacy and limitations

Local mode uses deterministic rules, not an LLM, and makes no cloud-writing request. Cloud Generate/Rewrite actions send selected recipient/sender context and, for rewrites, the current draft directly to the named provider. No PDF file is sent. Provider terms, access, billing and rate limits apply; NVIDIA hosted-trial demos must use permitted fictional/non-identifying data.

Keys live in extension-local storage restricted to trusted extension contexts. They are **not encrypted** and are not an OS credential vault; use a trusted device. They are not part of this repository or draft prompts. The extension never reads `.env`; that file is only an optional developer-test input and is ignored by Git.

LinkedIn layouts and languages vary; date detection is English-based. Source matching under “Why this message?” is not a fact-check. Review every message, especially cloud-generated text. Budgets are writing targets, not a guarantee of LinkedIn account limits. Twenty recipients means one final draft per recipient, not a version archive. Delete Undo lasts thirty seconds while the popup remains open.

## Development and verification

Use a recent Node.js release compatible with the locked Playwright dependency (Node 22+ recommended):

```sh
npm ci
npm test
npm run check
npm run browser:install
npm run test:browser
npm run test:polish
npm run test:recovery
npm run check:package
```

Browser scripts use isolated Chromium, the actual unpacked extension, fictional profiles and mocked API transport. The résumé fixture is generated in memory; no private résumé is required. These tests do not send LinkedIn messages. Browser downloads and disposable profiles are ignored. The polishing/recovery suites expect `qa/browser-cache`; `browser:install` installs there.

Recorded v3.7 verification: **72 logic tests**, **36 browser regression checks**, **8 final-polish journeys**, **8 key-recovery checks**. Groq and Gemini were additionally tested against real APIs using fictional data only; see the selected reports in [`qa`](qa). Claude/OpenAI are mock-tested, not live-tested. Installed Edge acceptance is separate from isolated Chromium checks.

Node coverage measured only background/credentials/outreach/providers/writer: 97.76% lines, 81.69% branches, 93.26% functions. These are NOT whole-extension coverage figures. See [verification notes](qa/final-polish.tdd.md).

Optional, billable live tests are never part of `npm test`. To run Groq/Gemini tests yourself, create a local ignored `.env` with your own `GROQ_API_KEY` and `GEMINI_API_KEY`, then run `node tests/multi-provider-live.cjs`. Do not commit keys or the resulting browser profiles.

## Project layout

```text
linkedin extention/   Extension to load/package; bundled local PDF.js
tests/               Logic and isolated browser tests
tools/               Package checks and optional developer utilities
qa/                  Selected reviewed verification evidence
DEMO_GUIDE.txt        Suggested screen-and-voice Loom walkthrough
```

See the extension's [detailed guide](linkedin%20extention/README.txt) and [third-party notices](linkedin%20extention/THIRD_PARTY_NOTICES.txt). Original extension rights remain with their owners; no new open-source licence is asserted. Published for assignment review; public visibility is not a grant of additional reuse rights.
