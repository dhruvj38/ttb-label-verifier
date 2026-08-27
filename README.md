# Label Verifier

**Live prototype:** [https://dhruvj38.github.io/ttb-label-verifier/](https://dhruvj38.github.io/ttb-label-verifier/)

**Source:** [https://github.com/dhruvj38/ttb-label-verifier](https://github.com/dhruvj38/ttb-label-verifier)

Label Verifier is a local-first proof of concept that helps a compliance reviewer compare distilled-spirits label artwork with submitted application values. It extracts text in the browser, checks six focused rules, and shows the application value beside the observed label evidence. It is a decision aid, not an official TTB approval tool.

## Try the demo

1. Open the [live prototype](https://dhruvj38.github.io/ttb-label-verifier/).
2. Select **Try sample label**. The sample application values are filled in automatically.
3. Select **Analyze label**.
4. Review each Pass, Mismatch, or Needs review result and its evidence.

For your own image, choose or drop a JPEG, PNG, or WebP label and enter:

- brand name;
- class/type;
- alcohol by volume as a numeric percentage; and
- net contents with a supported unit (`mL`, `L`, or `fl oz`).

Multiple images can be added together. The browser processes them sequentially with one reused OCR worker so a large selection does not decode every full-resolution image at once.

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

1. **Image preparation and OCR.** Oversized artwork is downscaled to a maximum dimension of 2,200 pixels and converted to a high-contrast grayscale image. A single warmed Tesseract LSTM worker extracts text.
2. **Pure comparison rules.** Small functions normalize identity text, extract ABV and volume values, compare the mandatory warning, and return typed tri-state results.
3. **Review interface.** React owns the batch queue and preserves each item's application data, progress, errors, OCR timing, extracted text, and evidence-linked checks.

Tesseract's worker, WebAssembly core, and English language data are bundled under the deployed origin. There is no server, database, account, secret, analytics SDK, AI API, or runtime dependency on a third-party domain.

### Matching policy

- Brand and class/type comparisons normalize Unicode, apostrophe variants, case, and repeated whitespace. `STONE'S THROW` and `Stone's Throw` pass.
- A close but non-equivalent identity match becomes **Needs review**, never an automatic pass.
- ABV is compared as the numeric alcohol-by-volume percentage; proof alone is not treated as ABV.
- Net contents are normalized to milliliters before comparison.
- The warning can pass only when its complete § 16.21 text, punctuation, capitalization, and uppercase prefix appear after line-break whitespace normalization. Near OCR matches or low-confidence text require review.
- Warning typography and physical presentation always require manual review. An unscaled photograph cannot prove bold weight, physical type size, separation, contrast, or ordinary-condition legibility.

## Tools

- Vite, React, and strict TypeScript for a small static UI
- Tesseract.js with local LSTM assets for browser-only OCR
- Vitest and React Testing Library for pure-rule and component behavior
- Playwright for the production-base-path, responsive, network, and real-OCR smoke tests
- ESLint and Prettier for static quality checks
- GitHub Actions and GitHub Pages for repeatable verification and deployment

## Privacy and security

Uploaded pixels remain inside the browser. The application creates temporary object URLs for previews, prepares an in-memory OCR image, and releases preview URLs when items are removed or the session is reset. It does not send label data to a server or persist review data between page loads.

The end-to-end OCR test records every browser request during analysis and fails if a request leaves the local origin (excluding browser-local `blob:` and `data:` URLs).

## Performance

The OCR worker begins warming after the initial render and is reused across the batch. Images larger than 2,200 pixels on either axis are downscaled before recognition. The UI reports both worker-ready and per-image recognition time rather than claiming a fixed service level.

On the included 1,400 × 1,800 high-contrast sample, the production Chromium smoke test completed OCR in **2.8 seconds** after an approximately **0.3 second** worker warm-up on the development machine. Hardware, browser cache, image size, glare, curvature, and text density materially affect timing; the stakeholder's roughly five-second goal is a target, not a guarantee.

## Assumptions and scope

- The automated rules are scoped to the assignment's distilled-spirits example. Beer and wine have different requirements and are not represented as supported.
- Application data is entered manually because this standalone prototype does not integrate with COLA.
- JPEG, PNG, and WebP images up to 12 MB are supported. PDF, HEIC, camera capture, CSV manifests, perspective correction, and COLA/API integration are out of scope.
- “Batch” means multi-file selection or drop with one application record per image, a bounded sequential queue, per-item progress, retry/removal, and a result summary.
- OCR is assistive. Poor photography, decorative lettering, bottle curvature, glare, and unusual layouts can reduce extraction quality. Ambiguous evidence is intentionally routed to a person.
- A manual reviewer must still evaluate all requirements outside the six checks shown here, including producer/importer details, country of origin where applicable, and warning presentation.

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
public/         Deterministic sample artwork
```

## Official sources

- [27 CFR § 16.21 — Mandatory statement](https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.21)
- [27 CFR § 16.22 — General requirements](https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.22)
- [TTB — Anatomy of a distilled spirits label](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/anatomy-of-a-distilled-spirits-label-tool)

## Limitations

This is an engineering prototype, not legal advice and not a regulatory rules engine. It deliberately refuses to infer physical typography from pixels, does not retain an audit record, and does not claim coverage of every distilled-spirits label variation. A production version would require legal validation, accessibility testing with actual agency users, security/privacy review, documented records handling, and integration-specific authorization.
