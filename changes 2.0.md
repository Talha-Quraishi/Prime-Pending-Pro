# Prime-Pending-Pro --- Changes 2.0

## Purpose

This is the **current remaining-work plan** based on the latest state of
the repository.

The project is staying with:

``` text
Electron
JavaScript
Existing Excel stack
Web Workers
Existing UI architecture
```

This document intentionally **does not repeat completed work** such as
the main test suite, security fixes, parser resilience, performance
tests, cancellation, processing summary, or the first stage of module
extraction.

The goal now is to finish the architecture cleanup without changing the
application's behavior.

------------------------------------------------------------------------

# 1. Finish `app.js` Refactor

## Current situation

`app.js` has already been reduced substantially.

Do **not** restart the refactor.

The remaining goal is to remove the larger processing responsibilities
that still live inside `app.js`.

### Target

`app.js` should become primarily an application orchestrator:

``` text
Startup
  ↓
Initialize modules
  ↓
Connect UI events
  ↓
Coordinate processing
```

It should not contain the implementation of the processing pipeline.

------------------------------------------------------------------------

## 1.1 Extract the Processing Pipeline

Move the main processing flow currently handled by `processFile()` into
a dedicated module.

Suggested:

``` text
js/
├── app.js
└── processing/
    ├── pipeline.js
    ├── worker-manager.js
    └── fallback.js
```

### `processing/pipeline.js`

Responsible for:

-   [ ] Starting a processing operation.
-   [ ] Preparing normalized input.
-   [ ] Calling the processing engine.
-   [ ] Handling processing stages.
-   [ ] Returning a normalized result.
-   [ ] Reporting progress.
-   [ ] Handling cancellation.
-   [ ] Returning structured errors.

Example API:

``` js
processWorkbook({
    file,
    options,
    signal,
    onProgress
});
```

The exact API should match the existing application.

------------------------------------------------------------------------

## 1.2 Extract Worker Management

Move worker-specific code out of `app.js`.

Suggested:

``` text
worker-manager.js
```

Responsible for:

-   [ ] Creating the worker.
-   [ ] Sending the processing request.
-   [ ] Receiving worker messages.
-   [ ] Translating progress events.
-   [ ] Handling worker errors.
-   [ ] Handling worker termination.
-   [ ] Handling cancellation.
-   [ ] Cleaning up worker references.

The rest of the application should not need to know the low-level Worker
API.

Conceptually:

``` js
const result = await processInWorker(data, {
    onProgress,
    signal
});
```

------------------------------------------------------------------------

## 1.3 Isolate the Fallback Processing Path

The non-worker/fallback Excel processing path should not be embedded
inside `app.js`.

Suggested:

``` text
processing/
└── fallback.js
```

Responsible for:

-   [ ] Loading workbook data.
-   [ ] Applying the same normalization rules as the worker path.
-   [ ] Running the same business rules.
-   [ ] Returning the same result shape.

### Important

Worker and fallback processing must produce equivalent results.

``` text
Worker path
     ↓
 Result A

Fallback path
     ↓
 Result B

A === B
```

Add regression coverage for this equivalence where practical.

------------------------------------------------------------------------

# 2. Reduce Global Coupling

This is the most important architectural improvement after the `app.js`
split.

The application now has modules, but some modules still communicate
through global variables/functions.

Examples of the type of coupling to eliminate:

``` js
typeof loadHistoryTable !== 'undefined'
```

or modules directly depending on variables created by `app.js`.

------------------------------------------------------------------------

## 2.1 Identify Global Dependencies

Create a list of:

-   [ ] Global variables.
-   [ ] Global functions.
-   [ ] `window.*` assignments.
-   [ ] Functions accessed indirectly through `typeof`.
-   [ ] Modules depending on `app.js` state.
-   [ ] UI modules depending on unrelated UI modules.

Do not remove globals blindly.

First document who owns each piece of state.

------------------------------------------------------------------------

## 2.2 Define Ownership

Each important piece of state should have one owner.

Example:

``` text
Settings
   ↓
settings.js

History
   ↓
history.js

Party rules
   ↓
party-rules.js

Processing state
   ↓
processing/pipeline.js

Navigation state
   ↓
navigation.js
```

Other modules should interact through functions/APIs rather than
directly modifying another module's variables.

------------------------------------------------------------------------

## 2.3 Replace Global Function Calls

Instead of:

``` js
window.loadHistoryTable();
```

prefer explicit imports where the module system supports it:

``` js
import { loadHistoryTable } from './history.js';
```

Or pass dependencies explicitly when appropriate.

Avoid creating a new global merely to solve an import problem.

------------------------------------------------------------------------

## 2.4 Avoid Circular Dependencies

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
 └── navigation.js

shared utilities
       ↑
all modules
```

If two modules need the same functionality, move that functionality into
a third shared module.

------------------------------------------------------------------------

# 3. Standardize Module APIs

Now that the project has separate modules, make their public interfaces
predictable.

Each module should expose a small API.

Example:

``` js
// history.js
export function initializeHistory() {}
export function refreshHistory() {}
export function deleteHistoryItem(id) {}
```

Avoid exporting internal implementation details.

------------------------------------------------------------------------

## Recommended module boundaries

``` text
ui/
├── navigation.js
├── toast.js
├── dashboard.js
├── history.js
├── settings.js
└── party-rules.js

excel/
├── reader.js
├── exporter.js
└── validation.js

processing/
├── pipeline.js
├── worker-manager.js
└── fallback.js

business/
├── deduplication.js
├── completion.js
└── party-rules.js

utils/
├── dates.js
├── formatting.js
└── helpers.js
```

Do not create files that contain only one trivial function unless the
separation genuinely improves maintainability.

------------------------------------------------------------------------

# 4. Separate Excel I/O From Business Processing

There are now dedicated Excel modules, so finish the boundary.

Target:

``` text
Excel file
    ↓
excel/reader.js
    ↓
Normalized rows
    ↓
business/
    ↓
Processed result
    ↓
excel/exporter.js
    ↓
Excel file
```

Business rules should not need to know about ExcelJS/SheetJS-specific
objects where avoidable.

------------------------------------------------------------------------

## Acceptance criteria

-   [ ] Excel reading is isolated.
-   [ ] Excel export is isolated.
-   [ ] Business logic operates on normalized data.
-   [ ] UI does not directly implement Excel processing.
-   [ ] Export formatting does not affect business-rule calculations.
-   [ ] Changing Excel column mapping does not require modifying
    business rules.

------------------------------------------------------------------------

# 5. Finish Persistent Storage Versioning

The project already has versioning in parts of the settings/rules
system.

Finish this consistently.

## Settings

``` js
{
    settingsVersion: 1,
    ...
}
```

## Party rules

``` js
{
    rulesVersion: 1,
    ...
}
```

## History metadata

Use a version where the stored structure requires it.

------------------------------------------------------------------------

## Migration system

When a future version changes the structure:

``` text
v1
 ↓
migration
 ↓
v2
```

Do not silently reset valid user data.

### Requirements

-   [ ] Detect the stored version.
-   [ ] Migrate older versions.
-   [ ] Validate migrated data.
-   [ ] Preserve the original data until migration succeeds.
-   [ ] Recover gracefully from corrupted data.
-   [ ] Test every supported migration.
-   [ ] Keep migrations deterministic.

------------------------------------------------------------------------

# 6. Dependency Audit

Review the current dependencies.

Run:

``` bash
npm outdated
npm audit
npm ls
```

Check:

-   [ ] Unused dependencies.
-   [ ] Duplicate dependencies.
-   [ ] Vulnerable dependencies.
-   [ ] Outdated Electron.
-   [ ] Outdated Electron Builder.
-   [ ] Outdated Electron Updater.
-   [ ] Excel-library versions.
-   [ ] UI/chart dependencies.

## Upgrade rules

Do not upgrade everything at once.

Use:

``` text
One dependency
     ↓
Tests
     ↓
Excel test
     ↓
Electron startup test
     ↓
Packaging test
     ↓
Next dependency
```

Major Electron or Excel-library upgrades should receive extra testing.

------------------------------------------------------------------------

# 7. Final UI State Review

This is a final polish pass, not a redesign.

## Empty states

-   [ ] No file selected.
-   [ ] No history.
-   [ ] No results.
-   [ ] No matching insights.
-   [ ] No configured rules.

## Loading states

-   [ ] Reading workbook.
-   [ ] Processing.
-   [ ] Exporting.
-   [ ] Loading history.
-   [ ] Checking for updates.

## Error states

Every error should communicate:

``` text
What happened?
What failed?
What should I do?
```

Verify:

-   [ ] No false success messages.
-   [ ] Failed operations return UI to a usable state.
-   [ ] Error messages are understandable.
-   [ ] Retry paths work where appropriate.

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

------------------------------------------------------------------------

# 8. Refactor Safety Rules

These rules apply to all remaining work.

### Rule 1 --- No behavior changes

A refactor should preserve:

``` text
Input
  ↓
Same business rules
  ↓
Same output
```

unless a behavior change is deliberately planned.

### Rule 2 --- Small commits/changes

Prefer:

``` text
Extract worker manager
↓
Test
↓
Extract fallback
↓
Test
↓
Reduce globals
↓
Test
```

rather than one giant refactor.

### Rule 3 --- Test after every extraction

Run:

``` bash
npm test
```

after each meaningful architectural change.

### Rule 4 --- Manual smoke test

After structural changes verify:

-   [ ] Application starts.
-   [ ] File selection works.
-   [ ] Excel processing works.
-   [ ] Worker processing works.
-   [ ] Fallback processing works.
-   [ ] Export works.
-   [ ] History works.
-   [ ] Settings work.
-   [ ] Party rules work.
-   [ ] Insights work.
-   [ ] Application closes cleanly.

------------------------------------------------------------------------

# 9. Final Target Architecture

``` text
                    Electron
                       │
              ┌────────┴────────┐
              │                 │
          Renderer          Main Process
              │                 │
              │              IPC / Files
              │                 │
              └────────┬────────┘
                       │
                    app.js
                 Orchestrator
                       │
        ┌──────────────┼──────────────┐
        │              │              │
       UI          Processing       Storage
        │              │              │
     ui/*.js       pipeline.js    settings
        │              │           history
        │        ┌─────┴─────┐     rules
        │        │           │
        │      Worker      Fallback
        │        │           │
        │        └─────┬─────┘
        │              │
        │         Business
        │           Rules
        │              │
        │        Normalized Data
        │              │
        └──────────────┼──────────────┐
                       │              │
                  Excel Reader    Excel Exporter
```

------------------------------------------------------------------------

# Definition of Done

The remaining architecture work is complete when:

-   [ ] `app.js` is primarily an orchestrator.
-   [ ] Processing pipeline is outside `app.js`.
-   [ ] Worker management is isolated.
-   [ ] Fallback processing is isolated.
-   [ ] Global coupling is substantially reduced.
-   [ ] Modules have clear public APIs.
-   [ ] Excel I/O is separated from business logic.
-   [ ] Persistent data has consistent versioning.
-   [ ] Migration paths are tested.
-   [ ] Dependencies have been audited.
-   [ ] Final UI state cleanup is complete.
-   [ ] Existing behavior remains intact.
-   [ ] Full test suite passes.
-   [ ] Manual smoke test passes.

------------------------------------------------------------------------

# What NOT to Change

Do not introduce:

-   Rust.
-   Tauri.
-   TypeScript migration.
-   A new desktop framework.
-   A new Excel library without a concrete reason.
-   A new state-management framework just for organization.
-   A complete rewrite.
-   Unnecessary abstractions.

The objective is:

> **Finish the refactor, reduce coupling, and make the existing Electron
> application clean and maintainable without replacing what already
> works.**
