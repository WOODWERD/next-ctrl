# TODAY record format

`items.json` at the top of the person's private repo. Version 1.

```json
{
  "version": 1,
  "items": [
    { "id": "td-mhoqx3a0-1k2f9", "text": "call the plumber", "due": "2026-11-07", "created": "2026-11-07", "done": false, "updatedAt": 1794067200000, "by": "claude" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Unique and never changed. For a new item: `td-` + the time in base 36 + `-` + 5 random letters or digits. |
| `text` | The item's words. |
| `due` | The day it's for, `YYYY-MM-DD` in the person's local date. Today shows anything due today or earlier; Tomorrow shows the rest. |
| `created` | The local date it was added. |
| `done` | `true` once finished. Finished items stay in the file for 30 days. |
| `updatedAt` | Time of the last change, in milliseconds since 1970. |
| `by` | `claude` for items you add, `app` for ones typed in the app. |

**Adding:** append to the end of `items`, with `done: false`, `created` and `due` set, and `by: "claude"`. The order of the list is the order added.

**Finishing:** set `done: true` and `updatedAt`. **Moving:** set `due` to the other day's date and `updatedAt`. **Editing:** set `text` and `updatedAt`. Never delete an item yourself.

**Commit messages:** `Add: <text>`, `Add for tomorrow: <text>`, `Done: <text>`, `Move to tomorrow: <text>`, `Move to today: <text>`, `Edit: <text>`. Several in one commit are joined with `; `.

Keep the file as two-space indented JSON with a newline at the end. If the file isn't valid JSON or has no `items` list, don't write it; say so.
