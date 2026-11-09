# Scope AI — Firefox build

## What's included
- Firefox Manifest V3 background script configuration.
- Scope AI account sign-in, Scope Max entitlement checks, and Gemini image-question workflow.
- Screenshot selection, image attachments, chat, dock/float panel, and saved preferences.
- Broader field selection, including specialized input types, textareas, ARIA textbox/searchbox/combobox controls, and common rich-text editors. Answer typing works in supported editable fields.
- Typing speed control from **5 to 1500 WPM** (default 30 WPM); the selected speed is saved locally.
- Exact code formatting in code editors (CMU CS Academy, Monaco, CodeMirror 5/6, Ace):
  1. When the page's editor object is reachable, code is inserted through the editor itself, so auto-indent, auto-dedent and auto-closing brackets never touch it. Indentation comes out exactly as written.
  2. Otherwise, after every Enter the extension reads the line the editor actually created (CMU and most editors already indent for you), then only adds the missing spaces or presses Backspace to remove extra indent. It never stacks its own indent on top of the editor's.
  3. If it can't see the editor's lines at all, it assumes the editor keeps the previous indent and adds one level after ":" or an open bracket, and only types the difference.
- While typing code, the status line shows which method is in use (for example "Monaco keys, measured indent").
- Original Scope AI icons and setup page.

## Install in Firefox
1. Extract `Scope-AI-Firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on…**.
4. Select the extracted `manifest.json`.

Temporary add-ons are removed when Firefox closes. For permanent distribution, the extension must be signed by Mozilla and packaged as an XPI.

## Important Firefox limitation
Firefox does not implement Chrome's `debugger` extension API. Therefore this Firefox build types into standard editable fields and supported contenteditable editors, and can select other page areas for cursor placement, but cannot send trusted keystrokes to canvas-based editors such as Google Docs/Slides/Sheets or arbitrary non-editable page locations. The Chrome build remains the version for those advanced typing targets.

## Scope account
The extension retains the existing Scope Max account requirement and the same Firebase project/configuration from the supplied files.
