# Prime-Pending-Pro — STRICT REMAINING CHANGES

## Purpose

This document contains **ONLY changes that are still required** after the latest repository review.

Everything already implemented is explicitly excluded.

The project remains on:

```text
Electron
JavaScript
Existing Excel stack
Web Workers
Existing modular structure
```

## STRICT RULE

> Do not redo completed work. Do not create unnecessary modules. Do not migrate technologies.

---

# 1. 🔴 REMOVE GLOBAL STATE COUPLING

## Objective

Make existing modules communicate through explicit APIs instead of hidden global variables/functions.

### Required

- [ ] Inventory every mutable global variable.
- [ ] Inventory every `window.*` assignment.
- [ ] Inventory every globally callable function.
- [ ] Inventory every `typeof someFunction` dependency.
- [ ] Identify modules reading another module's internal state.
- [ ] Identify modules writing another module's state.
- [ ] Assign one owner to every important state object.
- [ ] Replace hidden global function calls with explicit imports/APIs.
- [ ] Stop unrelated modules from directly mutating processing state.
- [ ] Avoid introducing circular dependencies.

### Examples of state ownership

```text
Navigation state
→ ui/navigation.js

Settings state
→ settings owner

History state
→ history owner

Party-rule configuration
→ rules/storage owner

Processing state
→ processing/pipeline.js

Processing result
→ explicit processing-result API
```

### Replace patterns such as

```js
if (typeof someFunction === 'function') {
    someFunction();
}
```

with explicit imports or controlled dependency passing.

Do not create new globals to replace old globals.

### Acceptance criteria

- [ ] No unnecessary `window.*` application-state globals.
- [ ] No unnecessary `typeof functionName` dependencies.
- [ ] Processing modules do not directly manipulate UI state.
- [ ] UI modules do not implement business algorithms.
- [ ] Important state has one owner.
- [ ] Existing behavior remains unchanged.

---

# 2. 🔴 FINISH `rules.js` SEPARATION

## Objective

`rules.js` should primarily be a **UI/controller layer**.

The existing business and storage modules must be reused:

```text
js/business/party-rules.js
js/storage/rules-storage.js
```

Do not recreate them.

## Required

### Business logic

Remove from `rules.js`:

- [ ] Party-rule algorithms.
- [ ] Party merge algorithms.
- [ ] Deduplication algorithms.
- [ ] Completion algorithms.
- [ ] Business matching algorithms.

These belong in the existing business layer.

### Storage

Remove duplicated storage implementation from `rules.js`:

- [ ] Serialization.
- [ ] Validation.
- [ ] Migration handling.
- [ ] Corrupt-data recovery.

Use the existing storage module.

### UI may remain in `rules.js`

- [ ] Rule controls.
- [ ] Rule list rendering.
- [ ] Party search.
- [ ] Chips.
- [ ] Keyboard handling.
- [ ] UI validation.
- [ ] User interaction.

### Critical requirement

Do not directly mutate processing globals from the rules UI.

Avoid:

```js
finalDeduplicatedData = ...
currentFilteredData = ...
```

Prefer an explicit processing/result API.

### Acceptance criteria

- [ ] `rules.js` contains no duplicated business algorithm.
- [ ] `rules.js` contains no duplicated storage implementation.
- [ ] `rules.js` does not directly own processing results.
- [ ] Existing rule behavior remains unchanged.
- [ ] Existing rule tests pass.

---

# 3. 🔴 FIX VERSION SOURCE OF TRUTH

## Problem

The repository currently has a version inconsistency between the package version and a hardcoded renderer fallback.

The intended architecture is:

```text
package.json
      ↓
Electron app.getVersion()
      ↓
preload/electronAPI
      ↓
renderer
```

## Required

- [ ] Confirm the intended release version.
- [ ] Keep that version in `package.json`.
- [ ] Remove stale hardcoded renderer versions.
- [ ] Remove unnecessary fallback version constants.
- [ ] Ensure renderer version comes from Electron.
- [ ] Check About/version display.
- [ ] Check updater/version display.
- [ ] Check installer/package version.
- [ ] Check HTML cache-busting version strings.
- [ ] Search the entire repository for stale versions.

Use:

```bash
git grep "3.30.18"
git grep "3.30.19"
git grep "3.30.20"
git grep "3.30.21"
```

Do not blindly replace matches. Understand each occurrence first.

### Acceptance criteria

There is one authoritative version source:

```text
package.json
```

All runtime version displays derive from it.

No stale hardcoded release version remains.

---

# 4. 🟡 STORAGE MIGRATION — KEEP MINIMAL

## Objective

The existing storage versioning is sufficient for the current schema.

Do not build a large migration framework.

Only make the existing mechanism safe for the next schema change.

## Required

- [ ] Confirm stored rules contain a version.
- [ ] Confirm stored data is validated before use.
- [ ] Confirm corrupt data cannot crash startup.
- [ ] Confirm migration code can distinguish versions.
- [ ] Add a representative old-format migration test.
- [ ] Preserve original data until migration succeeds.
- [ ] Handle unsupported versions safely.

Target shape:

```text
stored data
   ↓
version detection
   ↓
migration
   ↓
validation
   ↓
current data
```

### Do not

- [ ] Invent migrations for versions that never existed.
- [ ] Rewrite storage without a real schema change.
- [ ] Delete old user data automatically.
- [ ] Build an oversized generic migration framework.

---

# 5. 🟡 `main.js` — ONLY IF JUSTIFIED

## Objective

Clean up `main.js` only where a clear responsibility boundary improves maintainability.

Do not rewrite Electron architecture.

Potential responsibilities currently include:

- BrowserWindow lifecycle.
- IPC.
- File dialogs.
- File saving.
- History persistence/recovery.
- Configuration.
- Auto-updater.

Possible structure:

```text
main.js
├── window.js
├── ipc/
│   ├── config.js
│   ├── history.js
│   └── files.js
└── updater.js
```

This structure is optional.

### Required

- [ ] Identify actual responsibility boundaries first.
- [ ] Extract only clear, cohesive responsibilities.
- [ ] Keep security settings unchanged.
- [ ] Keep IPC behavior unchanged.
- [ ] Keep updater behavior unchanged.
- [ ] Keep file behavior unchanged.

If splitting `main.js` does not materially improve maintainability, **leave it alone**.

---

# 6. 🟢 DEPENDENCY AUDIT — MAINTENANCE ONLY

Run:

```bash
npm outdated
npm audit
npm ls
```

Review:

- [ ] Vulnerabilities.
- [ ] Unused dependencies.
- [ ] Duplicate dependencies.
- [ ] Electron.
- [ ] Electron Builder.
- [ ] Electron Updater.
- [ ] Excel packages.
- [ ] UI/chart packages.

## Rules

- [ ] Do not blindly upgrade everything.
- [ ] Do not perform unrelated major upgrades.
- [ ] Upgrade one important dependency at a time.
- [ ] Run tests after every dependency change.
- [ ] Test Excel processing after Excel dependency changes.
- [ ] Test Electron startup after Electron changes.
- [ ] Test packaging after builder changes.

If there is no meaningful issue, leave the dependency unchanged.

---

# 7. REQUIRED TESTING

Before changes:

```bash
npm test
```

After every major change:

```bash
npm test
```

## Manual smoke test

- [ ] Application launches.
- [ ] File selection works.
- [ ] Excel import works.
- [ ] Schema detection works.
- [ ] Worker processing works.
- [ ] Fallback processing works.
- [ ] Worker/fallback parity remains intact.
- [ ] Progress works.
- [ ] Cancellation works.
- [ ] Deduplication works.
- [ ] Party rules work.
- [ ] Dashboard works.
- [ ] Insights work.
- [ ] Export works.
- [ ] History works.
- [ ] Settings work.
- [ ] Version display is correct.
- [ ] Updater works.
- [ ] Application closes cleanly.

---

# STRICTLY DO NOT CHANGE

These areas are already implemented and are **out of scope**:

- [x] Do not recreate `processing/pipeline.js`.
- [x] Do not recreate `processing/worker-manager.js`.
- [x] Do not recreate `processing/fallback.js`.
- [x] Do not redo the `processor.js` split.
- [x] Do not recreate `business/normalization.js`.
- [x] Do not recreate `business/deduplication.js`.
- [x] Do not recreate `business/completion.js`.
- [x] Do not recreate `business/party-rules.js`.
- [x] Do not recreate `excel/schema.js`.
- [x] Do not recreate `excel/reader.js`.
- [x] Do not recreate `excel/exporter.js`.
- [x] Do not recreate `storage/rules-storage.js`.
- [x] Do not redo existing parity/integrity/performance/safety test work.
- [x] Do not migrate to TypeScript.
- [x] Do not migrate to Rust.
- [x] Do not migrate to Tauri.
- [x] Do not replace Electron.
- [x] Do not replace the existing Excel stack.
- [x] Do not add a new state-management framework.
- [x] Do not perform a complete rewrite.
- [x] Do not split files merely to reduce line count.

---

# FINAL DEFINITION OF DONE

## Global architecture

- [ ] Important application state has clear ownership.
- [ ] Modules communicate through explicit APIs.
- [ ] Hidden global dependencies are removed where practical.
- [ ] Unnecessary cross-module mutation is removed.
- [ ] No new circular dependencies exist.

## Rules

- [ ] `rules.js` is primarily UI/controller code.
- [ ] Business behavior uses `business/party-rules.js`.
- [ ] Storage uses `storage/rules-storage.js`.
- [ ] Rules UI does not directly mutate processing results.

## Versioning

- [ ] `package.json` is the authoritative version source.
- [ ] Renderer displays the actual Electron application version.
- [ ] Stale hardcoded release versions are removed.

## Storage

- [ ] Current storage is versioned.
- [ ] Stored data is validated.
- [ ] Corrupt data is handled safely.
- [ ] A minimal future migration path exists.

## Main process

- [ ] `main.js` has only useful, justified separation.
- [ ] No unnecessary Electron rewrite was introduced.

## Quality

- [ ] Dependency audit completed.
- [ ] `npm test` passes.
- [ ] Worker/fallback parity passes.
- [ ] Manual smoke test passes.
- [ ] Existing behavior remains intact.

---

# FINAL RULE

> **Only implement unchecked items in this document.**

If an item is already implemented in the repository:

**Do not touch it again unless fixing a verified bug.**

The goal is not to create more files.

The goal is to make the existing application:

```text
Reliable
Explicit
Testable
Maintainable
```
