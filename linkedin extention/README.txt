Outreach AI 3.7.0 - A better first conversation

Improves the supplied 3.1.0 MV3 extension; not a framework rebuild.
No licence key, company backend, automatic LinkedIn sending or web enrichment.

WHAT CHANGED IN 3.7 - FINAL POLISH
Recent is a searchable library of the latest 20 recipient drafts. Cards show
name, company, purpose, updated date and expandable preview. Open & edit and
Copy always use final edits, never mark a draft Sent. Delete removes the draft
from Recent and Current when active. Undo the most recent deletion for 30
seconds while the popup stays open; Undo never overwrites a newer version.
Only one final draft per recipient is kept, not a complete version archive.
Oldest recipient draft drops when full; storage/retention is shown in Recent.

Compose collapses recipient fields after a successful read. Edit recipient
details remains available; the remaining optional review checkbox is removed.
Longer explanations are collapsed into help, but cloud sharing is still named.
Highlight this project or skill chooses ONE saved, reviewed highlight for the
next draft. Auto chooses a relevant detail; No project uses your introduction.
Explicit choices are validated against saved facts before local/cloud writing.
Changing a choice does not rewrite existing text. Choices persist with drafts;
if saved evidence changes, re-select rather than silently substituting a claim.
Only chosen highlight + introduction is shared in explicit-selection mode.
Local budgets can omit optional context; check the draft and source ledger.

RETAINED 3.6 PROVIDER / KEY IMPROVEMENTS
Compose > Write with now shows Local, NVIDIA, Groq, Gemini, Claude and OpenAI
directly. Each cloud choice has its own Compose model dropdown and saved-key
status. Settings chooses which provider to configure; it no longer silently
determines which provider Compose can use. All five remain visible even if a
key is missing. Manage this provider opens the matching Settings fields.
Saving a model update refreshes the current Compose model.

Both cloud consent/trial checkboxes have been REMOVED, not auto-checked.
Choosing a cloud writer and clicking Generate/Rewrite initiates sharing, with
an inline notice naming the provider and exact selected data. Local is still
the default on reopening. Selecting/saving a provider alone sends no profile.
NVIDIA trial/data-use guidance remains a notice; account terms still apply.

Keys are now REMEMBERED on this device across Reload/update/browser restart
with the SAME extension identity. They live in chrome.storage.local under a
separate providerCredentials record, restricted to TRUSTED_CONTEXTS (extension
pages/worker). They are NOT encrypted and are NOT a secure OS credential vault.
Use your own trusted device. They are not synced, embedded in source or ZIP,
logged, included in drafts/prompts, or sent to a different provider.
Forget selected key / Forget all keys removes remembered credentials.
This security/storage tradeoff is explicit, to provide requested persistence.

IMPORTANT UPDATE STEPS
1. Keep the same installed extension and source folder.
2. At edge://extensions or chrome://extensions, click Reload. Then refresh
   LinkedIn so the page content script updates. Confirm v3.7.0 in the popup.
3. Do NOT Remove/reinstall or load from a different folder to update. A new
   unpacked path may create a different identity and separate storage.
4. If v3.5 already cleared session keys, they cannot be recovered by the update.
   Enter them ONCE in 3.7, Save, and subsequent same-identity reloads retain them.
   Old keys still available in session/legacy local storage migrate automatically.
5. Keys are cleared by Forget, removing the extension, clearing its storage or
   deleting its browser profile. A different browser/profile is a separate store.
6. First installation: enable Developer mode, Load unpacked THIS folder containing
   manifest.json. Disable an old Downloads copy to avoid duplicate icons.

Only package/load linkedin extention, NOT the parent workspace containing .env,
private resume, tests and browser profiles. The extension NEVER reads .env.
Provider hosts: api.groq.com, generativelanguage.googleapis.com, api.openai.com,
api.anthropic.com, integrate.api.nvidia.com. Review browser permissions yourself.

QUICK START - NO KEY REQUIRED
Your context > name, short bio and optional skills/projects > Save.
Optional PDF: parsed locally, up to 4 MB / 10 pages. Inspect extracted text,
select relevant lines, Use selected lines, edit highlights and Save.
Open a LinkedIn /in/ profile > Read/Refresh profile. Check/correct if necessary.
Name is required. Role/company may stay empty; no recipient check mark needed.
Pick one saved project/skill in Compose, or use Auto / introduction only.
Pick purpose, tone and custom ask. Choose connection note (default 200) or
direct message (default 700), with an adjustable writing budget. These budgets
are not guaranteed LinkedIn account limits.
Leave Write with = Local > Generate. Edit/copy/send yourself. Nothing auto-sends.

Five rule-based offline tones: Professional, Neutral, Casual, Warm and Direct.
Local rules change structure/opening/closing, choose one complete source sentence
from selected highlights (bio if highlights empty), preserve the ask and drop
optional details to fit. They are not semantic AI. No key/account/model download.
Plain headline roles, grouped current experience and visible company links are
supported. Source labels distinguish role/company provenance; separate labels
do not prove employment. Ambiguous organisation labels require your choice.
Unavailable/hidden fields are never invented; manual entry is available.

OPTIONAL CLOUD WRITERS
1. Your context > AI providers > select provider > paste its matching API key.
2. Choose model. Check available models lists the supported text-writing subset
   returned for that key; not every modality/model in the provider catalogue.
   Listing sends only key/auth, no personal context. It does not guarantee
   generation access, billing/quota or future model availability.
3. Test selected key & model makes a minimal fictional generation request and
   may consume API tokens. Save remembers all entered keys on this device.
4. Compose > Write with > choose ANY saved provider > select model > Generate.
   No checkbox needed. Missing key has an Add key shortcut to matching Settings.
5. Rewrites use that named provider and the current edited draft. Undo restores
   exact previous text. Failed rewriting preserves the original draft.
6. For cloud demos/tests use Try a fictional demo (Avery Demo / Jordan Example).
   It overrides sender context for that demo, not your saved real settings.

Use an OpenAI Platform API key, not a ChatGPT login/session token. Gemini uses
a Gemini API / Google AI Studio key, not an app login. Provider account/API
terms, data-use policies, access and charges apply. NVIDIA hosted trial:
use only fictional/non-identifying context permitted by your terms.
Never assume free/unlimited production access for any provider.

Cloud generation sends displayed recipient name/headline/role/company and field
source labels, sender name/bio/selected highlights, ask/purpose/tone and budget.
Rewrites also share the current draft. No PDF file, hidden About/Skills, profile
URL or unselected resume text is sent. No company server. Local does not fetch AI.
Calls time out at 25 seconds. Safe errors, labelled local generation fallback;
no automatic retry, key/account rotation or cloud-to-cloud failover.
Model IDs and endpoints are allowlisted; auth is in headers, not URL queries.
Key-validation/model-list actions send no personal context.

RECOVERY / EXPLANATIONS / LIMITS
Edits autosave; Recent remembers twenty final recipient drafts, not first output.
Replacement requires confirmation. Why this message matches actual source
phrases locally; it is not an AI rationale, fact-check or proof of causality.
LinkedIn markup/language/grouped layouts vary; manual correction may be needed.
Date detection is English-based. Scanned/encrypted PDFs may need pasted text.
Cloud AI may invent or exaggerate despite prompts: review before using.
Budget/schema checks do not verify every fact. Follow-up assumes actual contact.

VERIFICATION / DEMO
Parent workspace: npm ci, npm test, npm run check.
npm run browser:install then npm run test:browser (isolated, mocked transport).
node tests/key-recovery.cjs tests real developer reload of same unpacked path,
browser restart, content-script isolation, Compose selection and forgetting;
fake keys only. The test-only developer-debugging flag is not shipped/enabled
in the extension or your Edge installation.
tests/multi-provider-live.cjs tests Groq/Gemini with fictional demo only, reading
GROQ_API_KEY/GEMINI_API_KEY (or groq/gemini) from parent .env outside the package.
Optional --provider=gemini runs only that provider. No automatic retry in product.
NVIDIA smoke scripts remain optional and use only fictional data.
Final-polish acceptance, RED/GREEN and coverage: ../qa/final-polish.tdd.md and
../qa/final-polish-browser.json. Earlier recovery evidence:
../qa/compose-recovery-verification.txt,
../qa/key-recovery.json, ../qa/multi-provider-live.json, ../qa/browser-results.json.
Claude/OpenAI are mock-tested only, not live API tested. Installed Edge 3.7
acceptance is separate from isolated Chromium checks and still requires Reload.
Earlier verification reports and silent clip are historical, not this version.
See ../DEMO_GUIDE.txt. User must record/publish their Loom; no email was sent.

DEPENDENCIES
Mozilla PDF.js 5.6.205 packaged locally, Apache-2.0.
See vendor/pdfjs/LICENSE and THIRD_PARTY_NOTICES.txt. No runtime CDN download.
Storage reference: https://developer.chrome.com/docs/extensions/reference/api/storage
