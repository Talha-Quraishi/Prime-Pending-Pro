# Prime-Pending-Pro --- Changes 3.0

## Purpose

This document contains the **current remaining engineering changes**
after the latest repository review.

The project remains on the existing stack:

``` text
Electron
JavaScript
Existing Excel stack
Web Workers
Existing UI architecture
```

Do **not** re-implement work that is already completed.

------------------------------------------------------------------------

# Completed Work --- Do Not Repeat

The following areas are already implemented and should not be added back
to the remaining-work list:

-   [x] Processing pipeline extraction.
-   [x] Worker manager.
-   [x] Fallback processing engine.
-   [x] Streamlined `app.js` processing orchestration.
-   [x] Processing equivalence/parity tests.
-   [x] Integrity test updates.
-   [x] All current test suites enabled.
-   [x] Performance optimization/test work already committed.
-   [x] Automated safety tests already committed.
-   [x] Rule category filtering already implemented.
-   [x] Chart.js resize/re-render fix.
-   [x] GitHub updater fallback work.
-   [x] v3.30.19 release/binary work.
-   [x] Initial `ui/`, `excel/`, `utils/`, and `processing/` module
    extraction.

The next phase is about **architecture quality and maintainability**,
not another rewrite.

------------------------------------------------------------------------

# Priority 1 --- Split `processor.js`

## Problem

`js/processor.js` still contains too many responsibilities in one
module.

It currently combines areas such as:

-   Numeric normalization.
-   Date parsing.
-   Column/schema detection.
-   Excel row transformation.
-   Party merging.
-   Deduplication.
-   Completion invalidation.
-   Marka/grouping logic.
-   Similarity/Levenshtein logic.
-   Excel workbook generation.

This makes future changes risky because unrelated responsibilities are
coupled together.

## Goal

Turn `processor.js` into a **thin coordinator**.

The business logic and Excel-specific implementation should live in
focused modules.

------------------------------------------------------------------------

## Suggested structure

``` text
js/
├── processor.js
│
├── business/
│   ├── normalization.js
│   ├── deduplication.js
│   ├── completion.js
│   └── party-rules.js
│
└── excel/
    ├── reader.js
    ├── schema.js
    └── exporter.js
```

Do not create files simply to reduce line count.

Create a module only when it owns a clear responsibility.

------------------------------------------------------------------------

## 1.1 Extract normalization

Move reusable normalization logic into:

``` text
business/normalization.js
```

Possible responsibilities:

-   [ ] Numeric normalization.
-   [ ] String normalization.
-   [ ] Date normalization where it is business-related.
-   [ ] Empty/null normalization.
-   [ ] Shared value conversion.

The module should expose a small API.

Example:

``` js
export function normalizeRow(row) {
    // ...
}
```

------------------------------------------------------------------------

## 1.2 Extract schema/column detection

Excel/schema-specific logic should live under:

``` text
excel/schema.js
```

Responsibilities:

-   [ ] Column synonym detection.
-   [ ] Header matching.
-   [ ] Required-column validation.
-   [ ] Schema detection.
-   [ ] Mapping source columns to normalized fields.

Business logic should not depend directly on raw Excel column names.

Target flow:

``` text
Excel headers
    ↓
schema.js
    ↓
normalized field mapping
    ↓
business logic
```

------------------------------------------------------------------------

## 1.3 Extract deduplication

Move deduplication into:

``` text
business/deduplication.js
```

Responsibilities:

-   [ ] Duplicate detection.
-   [ ] Latest-order selection.
-   [ ] Party merge handling where appropriate.
-   [ ] Similarity matching.
-   [ ] Deduplication result generation.

The deduplication module should operate on normalized data, not
ExcelJS-specific objects.

------------------------------------------------------------------------

## 1.4 Extract completion/business rules

Move completion invalidation and related business calculations into:

``` text
business/completion.js
```

Responsibilities:

-   [ ] Completion calculations.
-   [ ] Completion invalidation.
-   [ ] Relevant business-state transformations.
-   [ ] Rules that determine whether a record is considered completed.

Keep these rules independent from UI code.

------------------------------------------------------------------------

## 1.5 Extract party-rule processing

Business party-rule behavior should live in:

``` text
business/party-rules.js
```

Responsibilities:

-   [ ] Party exclusion logic.
-   [ ] Party merge logic.
-   [ ] Special-party handling.
-   [ ] Rule application.
-   [ ] Rule-based filtering.

The UI should configure rules, not implement the business algorithms.

------------------------------------------------------------------------

## 1.6 Keep Excel export separate

Excel generation should remain in:

``` text
excel/exporter.js
```

Responsibilities:

-   [ ] Workbook creation.
-   [ ] Worksheet creation.
-   [ ] Headers.
-   [ ] Formatting.
-   [ ] Excel-specific output structure.
-   [ ] Saving/export preparation.

Business calculations should be completed before the exporter is called.

Target:

``` text
Business result
      ↓
excel/exporter.js
      ↓
Workbook
```

------------------------------------------------------------------------

## 1.7 Final `processor.js`

After extraction, `processor.js` should mainly coordinate:

``` text
Input
 ↓
Schema / normalization
 ↓
Business processing
 ↓
Deduplication
 ↓
Final result
 ↓
Excel export when requested
```

It should not contain the full implementation of every stage.

------------------------------------------------------------------------

# Priority 2 --- Remove Global State Coupling

## Problem

The application has separate modules, but some of those modules still
depend on global variables and global functions.

Examples include patterns such as:

``` js
typeof someGlobal !== 'undefined'
```

and modules directly reading/writing state owned by `app.js`.

This means the code is **physically modular but not fully
architecturally modular**.

------------------------------------------------------------------------

## 2.1 Inventory global state

Create a list of:

-   [ ] Global variables.
-   [ ] `window.*` variables.
-   [ ] Global functions.
-   [ ] Functions accessed using `typeof`.
-   [ ] State directly mutated by multiple modules.
-   [ ] Modules that implicitly depend on `app.js`.

Do this before removing globals.

------------------------------------------------------------------------

## 2.2 Assign ownership

Each important piece of state should have one owner.

Example:

``` text
Navigation state
    ↓
ui/navigation.js

Settings state
    ↓
ui/settings.js

History state
    ↓
ui/history.js

Party-rule state
    ↓
rules / party-rule module

Processing state
    ↓
processing/pipeline.js

Business result
    ↓
processing/business layer
```

Other modules should interact through explicit APIs.

------------------------------------------------------------------------

## 2.3 Replace hidden dependencies

Avoid:

``` js
if (typeof loadHistoryTable === 'function') {
    loadHistoryTable();
}
```

Prefer explicit module APIs:

``` js
import { loadHistoryTable } from './history.js';

loadHistoryTable();
```

Where direct imports are inappropriate, pass dependencies explicitly.

Do not create new globals to solve an import problem.

------------------------------------------------------------------------

## 2.4 Reduce direct mutation

Avoid modules directly changing another module's internal state.

Bad:

``` js
someOtherModuleState = value;
```

Prefer:

``` js
updateProcessingState(value);
```

or return the updated state through a controlled API.

------------------------------------------------------------------------

## 2.5 Establish clear data flow

Prefer:

``` text
Input
  ↓
Processing
  ↓
Result
  ↓
UI
```

instead of:

``` text
Global state
 ↙   ↓   ↘
UI  Rules  Processor
 ↖   ↓   ↗
Global state
```

------------------------------------------------------------------------

## 2.6 Avoid circular dependencies

Avoid:

``` text
app.js
 ↓
history.js
 ↓
app.js
```

Prefer:

``` text
app.js
 ├── history.js
 ├── settings.js
 ├── navigation.js
 └── processing/pipeline.js
```

Shared functionality should move into a neutral module rather than
creating circular imports.

------------------------------------------------------------------------

# Priority 3 --- Refactor `rules.js`

## Problem

`rules.js` is still responsible for too many concerns:

-   Rule persistence.
-   Rule state.
-   Rule compilation.
-   Party search.
-   Rule UI rendering.
-   Keyboard behavior.
-   Rule application.
-   Triggering re-deduplication.
-   Direct manipulation of global processing state.

## Goal

Separate:

``` text
Rule business logic
Rule persistence
Rule UI
```

------------------------------------------------------------------------

## Suggested structure

``` text
js/
├── business/
│   └── party-rules.js
│
├── storage/
│   └── rules-storage.js
│
└── ui/
    └── party-rules.js
```

The exact filenames can be adjusted to the existing project structure.

------------------------------------------------------------------------

## 3.1 Business rules

Move pure rule behavior into the business layer:

-   [ ] Exclusion.
-   [ ] Inclusion.
-   [ ] Party merge behavior.
-   [ ] Special party handling.
-   [ ] Rule matching.
-   [ ] Rule application.

This code should not manipulate DOM elements.

------------------------------------------------------------------------

## 3.2 Storage

Move persistence into a storage-focused module:

-   [ ] Load rules.
-   [ ] Save rules.
-   [ ] Validate stored rules.
-   [ ] Handle missing/corrupt data.
-   [ ] Manage storage version.

------------------------------------------------------------------------

## 3.3 UI

Keep DOM behavior in the UI module:

-   [ ] Rule list rendering.
-   [ ] Add/edit/delete controls.
-   [ ] Party search.
-   [ ] Chips.
-   [ ] Keyboard interaction.
-   [ ] UI validation messages.

The UI should call the rule API rather than implement the rule
algorithm.

------------------------------------------------------------------------

## 3.4 Stop direct manipulation of processing globals

Avoid patterns such as:

``` js
finalDeduplicatedData = ...
currentFilteredData = ...
```

from inside the rules UI.

Prefer:

``` js
const result = applyPartyRules(data, rules);
updateProcessingResult(result);
```

The exact API should follow the current architecture.

------------------------------------------------------------------------

# Priority 4 --- Fix Application Version Management

## Problem

The repository history contains the v3.30.19 release, while some
source/configuration locations still contain `3.30.18`.

This creates a risk of inconsistent version reporting and cache/update
behavior.

------------------------------------------------------------------------

## Goal

Use one authoritative version source.

Target:

``` text
package.json
     ↓
Electron app.getVersion()
     ↓
preload API
     ↓
renderer/UI
```

------------------------------------------------------------------------

## Tasks

-   [ ] Verify the current intended release version.
-   [ ] Make `package.json` authoritative.
-   [ ] Remove stale hardcoded `3.30.18` values.
-   [ ] Remove unnecessary renderer fallback version constants.
-   [ ] Check HTML cache-busting version strings.
-   [ ] Check updater version display.
-   [ ] Check About/version UI.
-   [ ] Check installer/package version.
-   [ ] Search the repository for stale version strings.

Useful search:

``` bash
git grep "3.30.18"
git grep "3.30.19"
```

After the correction, there should not be accidental old-version
references.

------------------------------------------------------------------------

# Priority 5 --- Finish Persistent Storage Migrations

## Current situation

Some stored data already has version markers such as:

``` js
settingsVersion: 1
```

This is useful, but a version marker alone is not a migration system.

------------------------------------------------------------------------

## Goal

Create a small migration mechanism.

Target:

``` text
Stored data
    ↓
Read version
    ↓
Validate
    ↓
Run migrations
    ↓
Validate new structure
    ↓
Save new version
```

------------------------------------------------------------------------

## 5.1 Settings

-   [ ] Define current schema.
-   [ ] Define schema version.
-   [ ] Detect old versions.
-   [ ] Migrate old versions.
-   [ ] Validate migrated settings.
-   [ ] Preserve data if migration fails.

------------------------------------------------------------------------

## 5.2 Party rules

-   [ ] Define rules schema version.
-   [ ] Detect old versions.
-   [ ] Migrate old rules.
-   [ ] Validate migrated rules.
-   [ ] Preserve original data until migration succeeds.

------------------------------------------------------------------------

## 5.3 History metadata

Where history metadata has a version-sensitive structure:

-   [ ] Define its schema.
-   [ ] Add migration support if required.
-   [ ] Handle corrupt metadata safely.
-   [ ] Never silently destroy valid history.

------------------------------------------------------------------------

## Migration rules

A migration should be:

-   [ ] Deterministic.
-   [ ] Idempotent where practical.
-   [ ] Tested.
-   [ ] Non-destructive.
-   [ ] Backward-aware.

Example:

``` text
v1
 ↓ migrateV1ToV2()
v2
```

Do not build an unnecessarily complicated migration framework.

------------------------------------------------------------------------

# Priority 6 --- Clean Up `main.js`

## Current situation

`main.js` handles several unrelated Electron responsibilities.

Potential areas include:

-   BrowserWindow creation.
-   IPC.
-   File dialogs.
-   File saving.
-   History persistence/recovery.
-   Configuration.
-   Auto-updater.

## Goal

Do this **after** the renderer architecture is stable.

Do not split `main.js` just because it is 300+ lines.

------------------------------------------------------------------------

## Suggested structure

``` text
main.js
├── window.js
├── ipc/
│   ├── config.js
│   ├── history.js
│   └── files.js
└── updater.js
```

Only extract modules where there is a clear responsibility.

------------------------------------------------------------------------

## Acceptance criteria

-   [ ] Browser window lifecycle remains unchanged.
-   [ ] IPC behavior remains unchanged.
-   [ ] File dialogs remain unchanged.
-   [ ] History recovery remains unchanged.
-   [ ] Auto-update behavior remains unchanged.
-   [ ] Security settings remain unchanged.
-   [ ] Packaging remains functional.

This is a maintainability refactor, not an Electron architecture
rewrite.

------------------------------------------------------------------------

# Priority 7 --- Dependency Audit

This is a maintenance task, not a dependency migration.

Run:

``` bash
npm outdated
npm audit
npm ls
```

Review:

-   [ ] Unused dependencies.
-   [ ] Duplicate dependencies.
-   [ ] Vulnerabilities.
-   [ ] Electron version.
-   [ ] Electron Builder version.
-   [ ] Electron Updater version.
-   [ ] Excel-related packages.
-   [ ] UI/chart packages.

## Upgrade policy

Do not upgrade everything simultaneously.

Use:

``` text
One dependency
      ↓
Tests
      ↓
Excel smoke test
      ↓
Electron startup
      ↓
Packaging
      ↓
Next dependency
```

Avoid major-version upgrades unless there is a clear benefit.

------------------------------------------------------------------------

# Priority 8 --- Final UI/State Cleanup

This is a polish pass, not a redesign.

## Empty states

-   [ ] No file selected.
-   [ ] No history.
-   [ ] No processing results.
-   [ ] No matching insights.
-   [ ] No configured party rules.

## Loading states

-   [ ] Reading workbook.
-   [ ] Processing.
-   [ ] Exporting.
-   [ ] Loading history.
-   [ ] Checking for updates.

## Error states

Every important error should answer:

``` text
What happened?
What failed?
What should the user do?
```

Verify:

-   [ ] No false success messages.
-   [ ] Failed operations leave the UI usable.
-   [ ] Error messages are understandable.
-   [ ] Retry actions work where appropriate.

## UI details

-   [ ] Long filenames.
-   [ ] Long party names.
-   [ ] Large tables.
-   [ ] Window resizing.
-   [ ] Keyboard navigation.
-   [ ] Focus states.
-   [ ] Disabled states.
-   [ ] Tooltips.
-   [ ] Dark mode consistency.
-   [ ] Chart resize/re-render behavior remains correct.

------------------------------------------------------------------------

# Priority 9 --- Regression Protection

All architectural changes must preserve existing behavior.

Before changes:

``` bash
npm test
```

After each meaningful extraction:

``` bash
npm test
```

------------------------------------------------------------------------

## Manual smoke test

Verify:

-   [ ] Application starts.
-   [ ] File selection works.
-   [ ] Excel import works.
-   [ ] Schema detection works.
-   [ ] Worker processing works.
-   [ ] Fallback processing works.
-   [ ] Worker/fallback results remain equivalent.
-   [ ] Progress reporting works.
-   [ ] Cancellation works.
-   [ ] Deduplication works.
-   [ ] Party rules work.
-   [ ] Dashboard works.
-   [ ] Insights work.
-   [ ] Export works.
-   [ ] History works.
-   [ ] Settings work.
-   [ ] Updates work.
-   [ ] Application closes cleanly.

------------------------------------------------------------------------

# Refactor Rules

## Rule 1 --- No unnecessary rewrite

Do not replace the current architecture.

## Rule 2 --- No technology migration

Do not introduce:

-   Rust.
-   Tauri.
-   TypeScript migration.
-   Another desktop framework.
-   Another Excel framework without a concrete requirement.

## Rule 3 --- Preserve behavior

For refactoring:

``` text
Same input
   ↓
Same business rules
   ↓
Same output
```

## Rule 4 --- Small changes

Prefer:

``` text
Extract module
 ↓
Test
 ↓
Verify
 ↓
Next extraction
```

rather than one giant refactor.

## Rule 5 --- Clear ownership

Every important state object should have one owner.

## Rule 6 --- Avoid unnecessary abstractions

Do not introduce:

-   A state-management framework just for organization.
-   Generic service layers with no real benefit.
-   Wrapper functions that only rename another function.
-   Extra files containing one trivial function.

------------------------------------------------------------------------

# Final Target Architecture

``` text
                         Electron
                            │
                ┌───────────┴───────────┐
                │                       │
           Renderer                 Main Process
                │                       │
                │                    IPC / Files
                │                       │
             app.js                     │
          Orchestrator                  │
                │                       │
      ┌─────────┼─────────┐             │
      │         │         │             │
      UI    Processing  Storage         │
      │         │         │             │
   ui/*.js   pipeline   settings        │
                │       history         │
        ┌───────┴───────┐ rules         │
        │               │               │
      Worker         Fallback           │
        │               │               │
        └───────┬───────┘               │
                │                       │
             Business                   │
             Modules                    │
                │                       │
          Normalized Data               │
                │                       │
         ┌──────┴──────┐                │
         │             │                │
     Excel Reader   Excel Exporter      │
```

The architecture should evolve toward:

``` text
UI
 ↓
Explicit APIs
 ↓
Processing coordinator
 ↓
Business logic
 ↓
Normalized data
 ↓
Excel I/O
```

rather than relying on global mutable state.

------------------------------------------------------------------------

# Definition of Done

The remaining work is complete when:

-   [ ] `processor.js` is reduced to a coordinator.
-   [ ] Normalization is separated from Excel I/O.
-   [ ] Deduplication is separated from the coordinator.
-   [ ] Completion/business rules are separated.
-   [ ] Party-rule business logic is separated from rule UI.
-   [ ] Global state coupling is substantially reduced.
-   [ ] Hidden `typeof global` dependencies are removed where practical.
-   [ ] Important state has clear ownership.
-   [ ] Module APIs are explicit.
-   [ ] No unnecessary circular dependencies remain.
-   [ ] Application version has one authoritative source.
-   [ ] Stale version strings are removed.
-   [ ] Storage versions have real migration behavior where needed.
-   [ ] `main.js` has been cleaned up only where useful.
-   [ ] Dependencies have been audited.
-   [ ] Final UI/state polish is complete.
-   [ ] Full tests pass.
-   [ ] Worker/fallback parity remains intact.
-   [ ] Manual smoke test passes.
-   [ ] Existing application behavior remains intact.

------------------------------------------------------------------------

# Final Principle

The project has already passed the stage of:

> "Break the monolith into files."

The next stage is:

> **"Make the modules genuinely independent, give state clear ownership,
> and keep business logic separate from UI and Excel I/O."**

Do not refactor for the sake of file count.

Refactor where it improves:

-   Reliability.
-   Testability.
-   Maintainability.
-   Debugging.
-   Future feature development.
-   Safety of changes.
