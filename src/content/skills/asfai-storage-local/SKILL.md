---
name: asfai-storage-local
description: The only instructions for saving ASFAI learner and educator records in browser storage (IndexedDB on the ASFAI Education site) or in a local JSON file on a host with file access, including downloadable JSON when nothing can be saved.
---

# Saving to browser storage or a local file

This is the single source of instructions for saving ASFAI data in browser storage (IndexedDB) or a local JSON file. Other ASFAI guidance only says to save "in the user's store"; when that store is the browser or a local file, follow this resource.

## When to use

- **Browser storage** needs JavaScript running on the ASFAI Education site with IndexedDB access. A remote MCP server or an ordinary chat cannot reach it, because IndexedDB belongs to one website.
- **Local file** needs a host tool that can read, atomically replace, and reread a file the user approved.

Offer only what the host can actually do. Call `asfai_storage` action `instructions` with `owner` (`learner` or `educator`), `target` (`{ "mode": "indexeddb" }` or `{ "mode": "local_file", "location": "<path>" }`), and the confirmed `hostCapabilities` (`browser_indexeddb`, `local_filesystem`). It returns the exact location and whether the host qualifies. If the user also has another ASFAI store, ask once which one to use; never split one person's records across stores.

These stores hold the learner profile and educator workspace only. Course files and writing drafts need a store that holds files.

## Storage target

When an ASFAI tool asks for a `storage` target (for example `record_learning`), pass `{ "mode": "indexeddb" }` or `{ "mode": "local_file", "location": "<path>" }`.

## Browser storage (IndexedDB)

Learner profile: database `asfai-education`, version `1`, object store `learner-profile`, key `current`. Educator workspace: key `current` in `indexeddb://asfai-education/educator-workspace`.

1. Open the database at version `1`. In `onupgradeneeded`, create the object store if absent.
2. Read key `current` before calling personalized tools. If absent, begin without a profile.
3. After a tool returns an updated profile or workspace, put the complete object at key `current` in a `readwrite` transaction.
4. Wait for the transaction's `complete` event; a successful request alone does not prove the write committed.
5. Read `current` back in a new `readonly` transaction and call `asfai_storage` action `verify` with the expected and actual values. Say it is saved only when `verified` is true.

## Local file

Default paths: `asfai/learner.json` for a learner and `asfai/educator-workspace.json` for an educator.

1. Read and parse the file before calling personalized tools. If it does not exist, begin without a profile.
2. Write the complete returned JSON to a temporary file in the same folder.
3. Atomically replace the target file with the temporary file.
4. Reread the file and call `asfai_storage` action `verify` with the expected and actual values. Say it is saved only when `verified` is true.

## ASFAI web app

The ASFAI Education web app uses browser storage by default, with the identifiers above, through its `LearnerStore` interface.

## Nothing can be saved

If no store is available, keep the result in the conversation or offer it as downloadable JSON (`asfai_storage` action `export`), and say saving is still pending. Name the step that did not complete.
