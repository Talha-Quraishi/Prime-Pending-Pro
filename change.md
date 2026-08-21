# Prime-Pending-Pro --- Remaining Changes Only

These are the **remaining items only** from the previous change plan.

All other previously listed changes are considered completed and are
intentionally not repeated here.

The existing **Electron + JavaScript architecture remains unchanged**.

------------------------------------------------------------------------

# 1. Split `app.js` by Responsibility

## Goal

Reduce the size and complexity of `app.js` without changing application
behavior.

**Do not rewrite `app.js` all at once.**

Extract one responsibility at a time and verify the application after
every extraction.

## Target Structure

``` text
js/
├── app.js
│
├── ui/
│   ├── navigation.js
│   ├── toast.js
│   ├── dashboard.js
│   ├── history.js
│   ├── settings.js
│   └── party-rules.js
│
├── excel/
│   ├── reader.js
│   ├── exporter.js
│   └── validation.js
│
├── business/
│   ├── deduplication.js
│   ├── completion.js
│   └── party-rules.js
│
└── utils/
    ├── dates.js
    ├── formatting.js
    └── helpers.js
```

The exact filenames can be adjusted to match the current codebase. The
important part is **separation by responsibility**.

## `app.js` should eventually contain mainly

``` js
initializeApp();
setupEventListeners();
initializeSettings();
initializeHistory();
initializeUI();
```

It should coordinate features rather than implement all of them.

## Extract in this order

### Step 1 --- Utility functions

Move reusable helpers first:

-   [ ] Date utilities.
-   [ ] Number/formatting utilities.
-   [ ] String normalization.
-   [ ] General DOM helpers.
-   [ ] Shared validation helpers.

### Step 2 --- Toast/notification system

Move:

-   [ ] Success notifications.
-   [ ] Error notifications.
-   [ ] Warning notifications.
-   [ ] Loading/status notifications.

Target:

``` js
showToast(message, type);
```

### Step 3 --- Navigation/UI state

Move:

-   [ ] Tab/page switching.
-   [ ] Active navigation state.
-   [ ] Sidebar state.
-   [ ] View visibility.

Target:

``` js
initializeNavigation();
```

### Step 4 --- Settings

Move:

-   [ ] Settings loading.
-   [ ] Settings saving.
-   [ ] Settings validation.
-   [ ] Settings UI events.
-   [ ] Reset settings.

Target:

``` js
initializeSettings();
```

### Step 5 --- History

Move:

-   [ ] History loading.
-   [ ] History rendering.
-   [ ] History selection.
-   [ ] History deletion.
-   [ ] Clear history.
-   [ ] History-related UI events.

Target:

``` js
initializeHistory();
```

### Step 6 --- Party rules

Move:

-   [ ] Party-rule loading.
-   [ ] Party-rule rendering.
-   [ ] Rule creation/editing.
-   [ ] Rule deletion.
-   [ ] Rule import/export.
-   [ ] Rule-related UI events.

Business-rule calculations should remain separate from the UI code.

### Step 7 --- Excel handling

Move:

-   [ ] Workbook loading.
-   [ ] Header/schema handling.
-   [ ] Excel validation.
-   [ ] Export-related UI.
-   [ ] Output-file handling.

Keep actual business processing separate from Excel UI/event handling.

### Step 8 --- Business logic

Ensure the following are not implemented directly inside `app.js`:

-   [ ] Deduplication.
-   [ ] Completion invalidation.
-   [ ] Party rules.
-   [ ] Marka logic.
-   [ ] Date/business calculations.
-   [ ] Data normalization.

`app.js` should call these modules rather than contain their algorithms.

------------------------------------------------------------------------

## Important Rule: Preserve Behavior

After every extraction:

``` bash
npm test
```

Then manually test the affected feature.

Example:

``` text
Extract history.js
       ↓
npm test
       ↓
Open application
       ↓
Test history
       ↓
Continue
```

Do not combine a large refactor with business-rule changes.

------------------------------------------------------------------------

## Avoid Circular Dependencies

Avoid structures such as:

``` text
app.js → history.js → app.js
```

Prefer:

``` text
app.js
  ↓
history.js
  ↓
shared utilities
```

If two modules need the same functionality, extract that functionality
into a third module.

------------------------------------------------------------------------

## Avoid Global State Where Practical

Instead of:

``` js
window.someGlobal = ...
```

prefer module-owned state.

If shared application state is genuinely required, keep it in one
clearly defined location rather than spreading mutable globals across
modules.

------------------------------------------------------------------------

## Final `app.js` Responsibility

The final `app.js` should primarily be the **application orchestrator**.

Conceptually:

``` js
import { initializeNavigation } from './ui/navigation.js';
import { initializeSettings } from './ui/settings.js';
import { initializeHistory } from './ui/history.js';
import { initializePartyRules } from './ui/party-rules.js';

async function initializeApp() {
    initializeNavigation();
    await initializeSettings();
    initializeHistory();
    initializePartyRules();
}

document.addEventListener('DOMContentLoaded', initializeApp);
```

The exact implementation should follow the existing application's
architecture.

------------------------------------------------------------------------

# 2. Dependency Hygiene

Regularly review dependencies without blindly upgrading them.

## Review

-   [ ] Check outdated dependencies.
-   [ ] Check known vulnerabilities.
-   [ ] Remove unused packages.
-   [ ] Check for duplicate packages.
-   [ ] Review Electron version.
-   [ ] Review Electron Builder version.
-   [ ] Review Electron Updater version.
-   [ ] Review Excel-processing library versions.
-   [ ] Review chart/UI library versions.

Useful commands:

``` bash
npm outdated
npm audit
```

## Rules

-   [ ] Do not blindly apply major-version updates.
-   [ ] Update one important dependency at a time.
-   [ ] Run the complete test suite after dependency updates.
-   [ ] Test Excel import/export after Excel-library updates.
-   [ ] Test Electron startup after Electron updates.
-   [ ] Test packaging after Electron Builder updates.
-   [ ] Test automatic updates after updater changes.
-   [ ] Keep a record of dependency changes that affect application
    behavior.

------------------------------------------------------------------------

# 3. Versioned Application Storage

Settings, history indexes, and configuration can change between
application versions.

Add explicit schema/version information to persisted data.

Example:

``` js
{
    schemaVersion: 1,
    ...
}
```

## Apply this to

-   [ ] Settings.
-   [ ] Party-rule configuration.
-   [ ] History metadata where appropriate.
-   [ ] Any future persisted application data.

## Migration

When the format changes:

``` text
Old data
   ↓
Detect version
   ↓
Migrate
   ↓
New format
```

Do not simply discard old user data.

## Acceptance Criteria

-   [ ] Persisted data has a version.
-   [ ] Old data can be migrated safely.
-   [ ] Corrupt data has a recovery path.
-   [ ] Failed migration does not destroy the original data.
-   [ ] Migration behavior has tests.
-   [ ] The application can start even when persisted data is invalid.

------------------------------------------------------------------------

# 4. Final UI/UX State Cleanup

Do a dedicated final pass over states users can encounter.

## Empty States

-   [ ] No file selected.
-   [ ] No history.
-   [ ] No matching insights.
-   [ ] No configured party rules.
-   [ ] No processing results.

## Loading States

-   [ ] File scanning.
-   [ ] Processing.
-   [ ] Exporting.
-   [ ] Loading history.
-   [ ] Checking for updates.

## Error States

Every error should:

-   [ ] Explain what happened.
-   [ ] Explain what action failed.
-   [ ] Give the user a useful next step.
-   [ ] Avoid showing a false success state.
-   [ ] Leave the application usable after the error.

## Interaction

-   [ ] Buttons are disabled during operations where appropriate.
-   [ ] Keyboard navigation works.
-   [ ] Focus states are visible.
-   [ ] Tooltips are available where needed.
-   [ ] Spacing is consistent.
-   [ ] Typography is consistent.
-   [ ] Long filenames display safely.
-   [ ] Long party names display safely.
-   [ ] Large tables remain usable.
-   [ ] Window resizing works correctly.
-   [ ] Dark mode remains consistent.

------------------------------------------------------------------------

# Completion

Once these four sections are complete:

1.  `app.js` is split by responsibility.
2.  Dependencies are reviewed and kept under control.
3.  Persisted application data has safe versioning/migration.
4.  UI/UX states have received a final cleanup pass.

No technology migration is required.

The project remains:

``` text
Electron
+
JavaScript
+
Existing Excel stack
+
Existing Web Worker architecture
```

The objective is to finish hardening and organizing the existing
application rather than replacing its architecture.
