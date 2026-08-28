# Label Verifier

**Live prototype:** [https://dhruvj38.github.io/ttb-label-verifier/](https://dhruvj38.github.io/ttb-label-verifier/)

**Source:** [https://github.com/dhruvj38/ttb-label-verifier](https://github.com/dhruvj38/ttb-label-verifier)

Label Verifier is a local-first proof of concept that helps a compliance reviewer compare distilled-spirits label artwork with submitted application values. It extracts text in the browser, checks eight focused rules, and shows the application value beside the observed label evidence. It is a decision aid, not an official TTB approval tool.

## Try the demo

1. Open the [live prototype](https://dhruvj38.github.io/ttb-label-verifier/).
2. Select **Try sample label** for pristine artwork, or **Try photo challenge** for an angled image with uneven lighting, shadow, and glare. The sample application values are filled in automatically.
3. Select **Analyze label**.
4. Review each Pass, Mismatch, or Needs review result and its evidence. Use **Inspect warning formatting** to zoom and pan the original label for the manual typography check.
5. After that inspection, select **Confirm compliant** to record a human warning-format decision. The sample then reaches eight passes; select **Clear manual decision** to return that check to Needs review.

For your own image, choose or drop a JPEG, PNG, or WebP label and enter:

- brand name;
- class/type;
- alcohol by volume as a numeric percentage; and
- net contents with a supported unit (`mL`, `L`, or `fl oz`);
- the complete bottler, producer, or importer name-and-address statement; and
- whether the product is domestic or imported, plus country of origin for an import.

Multiple images can be added together. On devices with at least four logical processors, the browser uses a bounded pool of two warmed OCR workers; constrained devices use one. This nearly halves large-batch time without decoding every full-resolution image or creating hundreds of workers at once. Live queue text reports how many labels are complete, processing, and waiting.

### CSV manifests for large batches

For a 200–300-image review, use **Download template** beside the application fields, populate it offline, then choose **Import CSV manifest**. The browser accepts exactly these columns:

```csv
filename,brand,class_type,abv,net_contents,name_address,origin,country_of_origin
```

Headers and filename matching are case-insensitive. Standard quoted CSV fields, escaped quotes, CRLF/LF line endings, and a UTF-8 BOM are supported. Import is all-or-nothing: it reports row-numbered schema/value problems, duplicate or ambiguous filenames, rows without a selected image, and selected images without a row before changing any application values. No manifest or image leaves the browser.

## Run locally

Requirements: Node.js 22 or newer and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL Vite prints, normally `http://localhost:5173`.

## Test and build

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm verify
```

`pnpm test:e2e` starts the production build at the same `/ttb-label-verifier/` base path used on GitHub Pages. Run `pnpm build` first if `dist/` does not exist. To inspect the production build manually:

```bash
pnpm preview --host 127.0.0.1
```

Then open `http://127.0.0.1:4173/ttb-label-verifier/`.

## Approach

The prototype is a static React/TypeScript application. It has three boundaries:

1. **Image preparation and OCR.** Oversized artwork is downscaled to a maximum dimension of 2,200 pixels. Percentile normalization and contrast-limited adaptive histogram equalization (CLAHE) recover text across shadows and uneven illumination before a bounded pool of one or two warmed Tesseract LSTM workers extracts text.
2. **Pure comparison rules.** Small functions normalize identity text, extract ABV and volume values, compare the mandatory warning, and return typed tri-state results.
3. **Review interface.** React owns the batch queue and preserves each item's application data, progress, errors, OCR timing, extracted text, and evidence-linked checks.

Tesseract's worker, WebAssembly core, and English language data are bundled under the deployed origin. There is no server, database, account, secret, analytics SDK, AI API, or runtime dependency on a third-party domain.

### Matching policy

- Brand, class/type, and name/address comparisons normalize Unicode, apostrophe variants, case, and repeated whitespace. A pass requires one complete OCR line or adjacent line group to match the application value; a substring alone cannot pass. `STONE'S THROW` and `Stone's Throw` pass.
- A close but non-equivalent identity match becomes **Needs review**, never an automatic pass.
- ABV is compared as the numeric alcohol-by-volume percentage; proof alone is not treated as ABV.
- Net contents are normalized to milliliters before comparison.
- Country of origin is marked not applicable for a domestic application. An imported application must provide a country, which can match a standalone line or a complete `Product of`, `Produced in`, or `Made in` statement.
- The warning can pass only when its complete § 16.21 text, punctuation, capitalization, and uppercase prefix appear after line-break whitespace normalization. Near OCR matches or low-confidence text require review. Its automatic confidence gate uses the warning lines rather than the whole-image average when line-level OCR data is available.
- Warning typography and physical presentation start as **Needs review**. The interface provides a keyboard-accessible 100–300% zoom and pannable original image, then records an explicit in-memory reviewer decision as compliant or a formatting problem. OCR never claims it proved bold weight, physical type size, separation, contrast, or ordinary-condition legibility.

## Tools

- Vite, React, and strict TypeScript for a small static UI
- Tesseract.js with local LSTM assets for browser-only OCR
- Vitest and React Testing Library for pure-rule and component behavior
- Playwright for the production-base-path, responsive, network, and real-OCR smoke tests
- ESLint and Prettier for static quality checks
- GitHub Actions and GitHub Pages for repeatable verification and deployment

## Privacy and security

Uploaded pixels remain inside the browser. The application creates temporary object URLs for previews, prepares an in-memory OCR image, and releases preview URLs when items are removed or the session is reset. CSV values and manual warning decisions exist only in the current in-memory review state; it does not send label data to a server or persist review data between page loads.

The end-to-end OCR test records every browser request during analysis and fails if a request leaves the local origin (excluding browser-local `blob:` and `data:` URLs).

## Performance

The OCR worker pool begins warming after the initial render and is reused across the batch. Images larger than 2,200 pixels on either axis are downscaled before recognition. The UI reports worker count, worker-ready time, live queue state, and per-image recognition time rather than claiming a fixed service level.

On the included 1,400 × 1,800 high-contrast sample, repeated production Chromium smoke tests completed OCR in **2.3–2.4 seconds at 95% confidence** after an approximately **0.3 second** two-worker warm-up on the development machine. The included 1,600 × 1,900 angled, shadowed, and glare-overlaid challenge completed in **2.6–2.7 seconds at 92% confidence**: all six application-value checks passed, while one warning OCR artifact correctly stayed in Needs review instead of auto-passing. Two pristine labels processed concurrently in approximately **3.0 seconds total**.

At the observed 2.3 seconds per image, a continuously fed two-worker pool has an ideal OCR time of roughly **4 minutes for 200 labels** or **6 minutes for 300**, before browser and file-handling overhead. A constrained one-worker device would take roughly twice as long. Hardware, browser cache, image size, glare, curvature, and text density materially affect timing; the stakeholder's roughly five-second per-label goal is a target, not a guarantee.

### Where a local vision model could help

The current prototype uses a local neural OCR model plus deterministic, auditable comparison rules. Its classical local-vision preprocessing addresses lighting variation without adding model download size or network dependence. A production discovery phase should benchmark a small quantized vision model running locally through WebGPU as a second tier for perspective correction, decorative lettering, glare/curvature detection, and field-region proposals. It should never silently replace the rules: the model would return candidate regions and quality signals, OCR would produce reviewable text, and the same comparison layer would decide Pass, Mismatch, or Needs review. A confidence-gated fallback preserves the no-outbound-traffic constraint while keeping model uncertainty visible to agents. Adoption would depend on measured accuracy, memory use, cold-start time, browser support, and accessibility—not an “AI” label alone.

## Assumptions and scope

- The automated rules are scoped to the assignment's distilled-spirits example. Beer and wine have different requirements and are not represented as supported.
- Application data is entered manually because this standalone prototype does not integrate with COLA.
- JPEG, PNG, and WebP images up to 12 MB are supported. PDF, HEIC, camera capture, perspective correction, and COLA/API integration are out of scope.
- “Batch” means multi-file selection or drop, optional atomic local CSV value import, one application record per image, a bounded one- or two-worker queue, per-item progress, retry/removal, and a result summary. Completed unchanged records are not sent through OCR again when new ready records are analyzed.
- OCR is assistive. Poor photography, decorative lettering, bottle curvature, glare, and unusual layouts can reduce extraction quality. Ambiguous evidence is intentionally routed to a person.
- A manual reviewer must still evaluate requirements outside the eight checks shown here, including conditional disclosures, same-field-of-vision placement, physical type sizes, and warning presentation.

## Project structure

```text
src/
  app/          Batch state and three-step workflow
  components/   Evidence and status presentation
  domain/       Parsing, normalization, rules, and legal text
  ocr/          Same-origin OCR adapter and image preprocessing
  styles/       Responsive visual system
tests/
  unit/         Deterministic domain-rule coverage
  component/    Upload, result, queue, and failure isolation
  e2e/          Production preview, responsive UI, and real OCR
public/         Deterministic pristine and photo-challenge sample artwork
```

## Official sources

- [27 CFR § 16.21 — Mandatory statement](https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.21)
- [27 CFR § 16.22 — General requirements](https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.22)
- [TTB — Anatomy of a distilled spirits label](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/anatomy-of-a-distilled-spirits-label-tool)
- [TTB — Distilled spirits name and address](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-name-address)

## Limitations

This is an engineering prototype, not legal advice and not a regulatory rules engine. It deliberately refuses to infer physical typography from pixels, does not retain an audit record, and does not claim coverage of every distilled-spirits label variation. A production version would require legal validation, accessibility testing with actual agency users, security/privacy review, documented records handling, and integration-specific authorization.
