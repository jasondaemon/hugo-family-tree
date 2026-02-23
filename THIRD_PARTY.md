# Third-Party Components

This project includes or references the following third-party components.

## Admin UI
- **Toast UI Editor** (`@toast-ui/editor`)
  - Purpose: WYSIWYG + Markdown editing for person story content in admin.
  - Source: [https://github.com/nhn/tui.editor](https://github.com/nhn/tui.editor)
  - Vendored under: `admin/static/vendor/toastui-editor/` (upstream source: `https://uicdn.toast.com/editor/latest/`)
  - License: MIT

## Notes
- Runtime content under `src/`, `public/`, `public_tmp/`, and `public_prev/` is excluded from git.
- Theme licensing is tracked separately by the admin theme installer manifest (`/src/.hft/themes-installed.json`).


## Toast UI Editor Plugins
- **Color Syntax Plugin** (`@toast-ui/editor-plugin-color-syntax`)
  - Purpose: text color controls in Story WYSIWYG.
  - Upstream: [https://github.com/nhn/tui.editor](https://github.com/nhn/tui.editor)
  - Vendored under: `admin/static/vendor/toastui-editor/plugins/`
  - License: MIT

- **Table Merged Cell Plugin** (`@toast-ui/editor-plugin-table-merged-cell`)
  - Purpose: richer table editing (merge/split cells) in Story WYSIWYG.
  - Upstream: [https://github.com/nhn/tui.editor](https://github.com/nhn/tui.editor)
  - Vendored under: `admin/static/vendor/toastui-editor/plugins/`
  - License: MIT

- **TUI Color Picker** (`tui-color-picker`)
  - Purpose: required dependency for Toast UI color-syntax toolbar support.
  - Upstream: [https://github.com/nhn/tui.color-picker](https://github.com/nhn/tui.color-picker)
  - Vendored under: `admin/static/vendor/tui-color-picker/`
  - License: MIT
