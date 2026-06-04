# c3source

Utilities for reading and traversing Construct 3 project source files: layouts, layers, instances, and event sheets.

## Purpose

`c3source` provides typed interfaces and traversal functions for working with C3 JSON source files on disk. It is used by build tools, code generators, and analyzers that need to inspect or mutate project files outside the C3 editor.

## Compatibility & caveats

> [!IMPORTANT]
> - **Folder-based projects only.** This library reads and writes the JSON files of a C3 project saved as a **folder** (the "Save as project folder" layout, with separate `layouts/`, `eventSheets/`, `objectTypes/` files). It does **not** handle the single-file `.c3p`/`.c3proj` archive export. The folder project's `project.c3proj` **manifest** (a JSON file in the project root, distinct from the archive) is modeled by `C3ProjectManifest`, parsed strictly by `parseProjectManifest`/`readProjectManifest`, and drift-checked by `detectManifestDrift`.
> - **Pinned to a specific C3 version.** The types and traversal logic were derived from Construct 3 **r487** (`savedWithRelease: 48700`, `projectFormatVersion: 1`; see `test/fixtures/c3source-fixture/project.c3proj`). Other releases may serialize differently.
> - **Built on undocumented internals.** Construct 3's on-disk format is **not a documented or stable public interface**. These interfaces were reverse-engineered from project output, so a future C3 release can change the shape without notice and **break this library**. Pin your C3 version, and re-validate the fixtures against any new C3 release before upgrading.

## Exported Types

### Layout types

| Type | Description |
|------|-------------|
| `Layout` | A C3 layout file (`name`, `layers`, optional `nonworld-instances`) |
| `Layer` | A layer within a layout (`name`, optional `subLayers`, `instances`, `global`) |
| `Instance` | An object instance (`type`, `uid`, `properties`, optional `instanceVariables`, `effects`) |
| `ObjectType` | An object type definition (`name`, `plugin-id`) |

### Event sheet types

| Type | Description |
|------|-------------|
| `EventSheet` | Root event sheet object (`name`, `events`, `sid`) |
| `EventSheetEvent` | Union of all event types |
| `BlockEvent` | Standard condition/action block |
| `FunctionBlockEvent` | Named function block |
| `CustomAceBlockEvent` | Custom ACE (action/condition/expression) block |
| `GroupEvent` | Named group with children |
| `IncludeEvent` | Include directive referencing another sheet |
| `CommentEvent` | Inline comment |
| `EventSheetVariable` | Sheet-level variable declaration |
| `Condition` | A single condition within a block |
| `ScriptAction` | A TypeScript script action |
| `FunctionParameter` | A parameter on a function-block |
| `ExtractedScript` | A script block extracted by `extractScriptsFromSheet`, with coordinates and scope info |
| `ScopeSegment` | One scope level contributing variables (for typed `localVars` composition) |

## Exported Functions

### File discovery

```ts
find_all_layouts_path(layoutDir: string): string[]
find_all_eventsheets_path(eventSheetsDir: string): string[]
find_all_objectTypes_path(objectTypesDir: string): string[]
```

Recursively collect `.json` files (excluding `.uistate.json`) from a directory tree.

### Layout traversal

```ts
// Visitor returns the number of mutations made; layout is written back if > 0.
type LayerVisitor = (layer: Layer, fullLayerName: string) => number;
type InstanceVisitor = (instance: Instance, index: number, layer: Layer, fullLayerName: string) => boolean;

visit_layers_in_layouts(layoutsPath: string, visitor: LayerVisitor): number
visit_instances_in_layouts(layoutsPath: string, visitor: InstanceVisitor): number
get_all_global_layers(layoutsPath: string): Set<string>
```

Walk every layer (or instance) across all layouts in a directory. Mutating visitors should return a nonzero/truthy value — the file is written back automatically.

### Event sheet utilities

```ts
extractScriptsFromSheet(sheet: EventSheet): ExtractedScript[]
generateFunctionName(sheetName: string, eventIndex: number, actionIndex: number): string
formatCondition(cond: Condition): string
formatAction(action: ScriptAction | Record<string, unknown>, sheetName: string, eventIndex: number, actionIndex: number): string
normalizeLineEndings(text: string): string
```

## Usage Examples

### List all layout files

```ts
import { find_all_layouts_path } from "@genvid/c3source";

const paths = find_all_layouts_path("./layouts");
// ["./layouts/MainMenu.json", "./layouts/Battle/Battle.json", ...]
```

### Walk every instance across all layouts

```ts
import { visit_instances_in_layouts } from "@genvid/c3source";

const changed = visit_instances_in_layouts("./layouts", (instance, index, layer, fullLayerName) => {
  if (instance.type === "Sprite" && instance.properties.text === "TODO") {
    instance.properties.text = "";
    return true; // mark as changed — layout will be written back
  }
  return false;
});
console.log(`Updated ${changed} instances`);
```

### Extract script blocks from an event sheet

```ts
import { readFileSync } from "node:fs";
import { type EventSheet, extractScriptsFromSheet } from "@genvid/c3source";

const sheet: EventSheet = JSON.parse(readFileSync("./eventSheets/GamePlay.json", "utf-8"));
const scripts = extractScriptsFromSheet(sheet);

for (const s of scripts) {
  console.log(`${s.sheetName} event ${s.eventIndex} action ${s.actionIndex}: ${s.humanPath}`);
  console.log(s.lines.join("\n"));
}
```

### Format a condition for display

```ts
import { formatCondition } from "@genvid/c3source";

const label = formatCondition({ id: "on-start-of-layout", objectClass: "System", sid: 1 });
// "System.on-start-of-layout()"
```

## Further reading

For usage reference covering SID traversal, editor-local classification, and project manifest parsing/drift detection, see [docs/api-guide.md](docs/api-guide.md).

## Notes

- Layer visitor full names use the format `LayoutName.LayerName`; global layers use `global.LayerName`.
- `extractScriptsFromSheet` counts events depth-first to match C3's internal event numbering.
- All file writes use tab indentation to match C3's serialization format.
- Line endings in expressions and comments are normalized to LF by `normalizeLineEndings`.
