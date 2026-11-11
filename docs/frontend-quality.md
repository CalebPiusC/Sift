# F7 frontend quality notes

## Delivery / low-data

- Inbox is the initial screen. Catalogue, Orders, Insights and Settings use Next dynamic
  chunks with a shared skeleton fallback. PDF/fontkit are already imported only on download.
- All photo elements use lazy loading, async decode and explicit dimensions. Uploads are
  locally re-encoded to JPEG, bounded to 1280px (640px / lower quality in low-data), with
  decoded bitmap cleanup; no arbitrary image proxy or fabricated remote thumbnail URL.
- Low-data catalogue lists omit images and image placeholders completely. Detail photos
  load only after an explicit tap. No animations/transitions run in low-data or reduced-motion.
- Real remote storage/CDN responsive variants, offline mutation sync and live uploads remain
  backend work. The bundled receipt font is downloaded only for an intentional PDF action.

## Accessibility / consistency

- Shared minimum 48px controls, visible keyboard outlines (light/dark), skip link,
  programmatic tab-screen and multi-step heading focus, labelled icons, properly named cards.
- Customer dialog traps Tab/Shift-Tab, closes with Escape and restores trigger focus.
- Shared skeleton/status, retryable resource errors, screen error boundary, standard empty
  states; no raw exceptions or personal message data written to logs.
- Body muted text uses slate-600 light / slate-400 dark; warning and success have distinct
  readable foreground shades, keeping brand fills. Chat timestamps no longer lower opacity.
- Automated axe WCAG 2 A/AA + 2.1 A/AA scans cover all five tabs, settings/extras in both
  themes; demo scans additionally cover onboarding, product details/prices, chat/approval,
  customer dialog, payment confirmation and receipt. Incomplete automated contrast checks
  (e.g. clipped/offscreen items) are not represented as a full WCAG certification.
- Keyboard assertions exercise skip navigation, Enter activation, dialog containment,
  Escape and focus restoration. A real assistive-technology/device audit is still advisable.

## Reproducible bundle / connection check

`SELVORA_TEST_URL=http://localhost:3001 npm run test:performance` measures actual JS responses
requested before the inbox is ready, recompresses them with gzip for a comparable budget,
then proves Insights fetches a new screen chunk and Catalogue opens. No dev-server figures.
Initial JS budget: **280 KiB gzip**. Synthetic conditions: cold cache, 500 kbps download,
250 kbps upload, 400ms latency, 4× CPU slowdown; usable inbox budget **45 seconds**.

Measured before F7: **958,690 bytes raw / 271,422 gzip** (265.1 KiB), ready in 6.7s.
Final F7 build: **871,932 raw / 252,908 gzip** (247.0 KiB), ready in 6.4s.
About **7% less initial gzip JS**; exact final counts vary with build changes. These local
Chromium synthetic timings are not a promise of real Lagos mobile-network performance.
The script prints current measurements; `PERF_REPORT=/tmp/report.json` retains a local report.

`npm run test:ui` runs Playwright through the repository's bundled Chromium helper rather
than requiring a separately installed browser. All tests target sample mode; they neither
claim real provider delivery nor replace hosted backend/security validation.
