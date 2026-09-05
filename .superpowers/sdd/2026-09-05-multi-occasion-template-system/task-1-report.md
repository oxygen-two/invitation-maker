# Task 1 Report: Catalog Validation And Lookup Boundary

## Implementation
- Added a defensive UMD catalog module at `assets/template-catalog.js` with fixed occasion and family allowlists, legacy family mapping, catalog normalization, and deep-copy lookup helpers.
- Wired `assets/app.js` to prefer `TemplateCatalog.normalizeCatalog(data)` when the catalog module is present, while preserving the existing fallback path.
- Loaded the catalog script in `index.html` before `invitation-core.js` so the browser gets the catalog boundary before the maker boots.
- Added focused tests in `tests/template-catalog.test.js` to cover normalization, invalid relationship filtering, lookup cloning, and legacy family mapping.

## Files Changed
- `assets/template-catalog.js`
- `assets/app.js`
- `index.html`
- `tests/template-catalog.test.js`

## RED
Command:
```bash
node --test tests/template-catalog.test.js
```

Output:
```text
Error: Cannot find module '../assets/template-catalog.js'
```

## GREEN
Focused command:
```bash
node --test tests/template-catalog.test.js
```

Output:
```text
✔ normalizes known occasions and drops presets with invalid relationships
✔ looks up two presets without exposing mutable defaults
✔ maps legacy IDs to approved families and unknown values to romantic-story
```

## Full Suite
Command:
```bash
node --test tests/*.test.js
```

Result:
```text
170 tests passed, 0 failed
```

## Self-Review
- The catalog boundary is isolated and defensive: bad occasions or preset relationships are dropped, and public lookup results are cloned before returning.
- `app.js` only consumes the new catalog when the module exists, so the current maker behavior stays intact if the script is absent.
- The current task does not change the invitation renderer or the template data file itself.

## Concerns
- `normalizeCatalog` currently validates the catalog envelope and lookup boundaries, but it does not yet reshape the broader template system that later tasks will add.
- Future template data updates still need to respect the allowlists in `TemplateCatalog` or the entries will be dropped.
