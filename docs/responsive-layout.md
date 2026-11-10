# Responsive workspace

- Below768px: phone bottom navigation; list and chat are separate screens.
- From768px: fixed left navigation with Selvora branding, labels and an accessible
  collapse/expand toggle. Collapsing keeps accessible names and icon tooltips.
  Hidden bottom navigation has no layout box, is absent from the accessibility tree,
  and cannot receive keyboard focus.
- From1024px: inbox list and thread side by side. From1280px: an inline customer
  details panel adds a third column. Customer editing uses the same data/actions
  as the phone drawer. Resize listeners mount the inline form only at that breakpoint.
- Catalogue uses responsive card columns; product details/editing and orders use
  focus-managed side sheets. Escape closes a sheet and restores the opener's focus.
  Orders use a semantic table from768px and cards below it.
- Insights charts use two columns from768px; summary cards use four from1280px.
- Settings uses a left section menu and bounded right content from768px.
- Workspace content is centered at max-w-7xl (1280px); settings content is additionally
  bounded at max-w-3xl. Chat panes use minmax columns to avoid forcing overflow.

## Inbox keyboard use (1024px and wider)

Arrow Down/Up focuses the next/previous visible conversation row (clamped at list
ends). Enter uses native button activation to open the focused chat. Escape closes
the active customer drawer/side sheet first, otherwise the conversation, and returns
focus to the list. Arrow navigation does not intercept text inputs, textareas,
selects, editable content or modified shortcuts. Tab navigation remains available.

## Checks

Build/start a **mock-mode** workspace, then run:

```sh
npm run build
npm run start -w web -- --port 3010
# In another terminal:
SELVORA_TEST_URL=http://localhost:3010 npm run test:layout
SELVORA_TEST_URL=http://localhost:3010 npm run test:a11y
```

`test:layout` uses Playwright and the existing bundled Chromium helper. It checks
390,768,820,1024,1279,1280 and1440px widths, including exact boundary changes,
side-by-side inbox geometry, third-pane visibility, keyboard actions, order tables,
product editing, dismissal, sidebar collapse and horizontal overflow. It scans
open inbox, all five workspace areas, product/order sheets and collapsed navigation
in light/dark modes at390,820 and1440px with axe WCAG2/2.1 A/AA rules. Detailed
axe output is written outside Git to `/tmp/responsive-a11y.json`.

`test:a11y` retains the wider phone settings/extras light/dark regression scans.
Automated axe checks do not replace human screen-reader and usability review.
