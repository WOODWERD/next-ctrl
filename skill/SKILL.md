---
name: today
description: TODAY, the person's own list of what to get done today and tomorrow, kept in their private GitHub repo. Use whenever they say "/today", start with "today:", or ask to add something to today's list, what's on today, or that something on it is done or should move to tomorrow. Works mid-chat on any other work; add, confirm in one line, carry on.
---

# TODAY

The person keeps a short list: **Today** and **Tomorrow**. You add to it from what they say, and read or change it when asked. The list is `items.json` in their private GitHub repo. Anything unfinished rolls to Today by itself; you never move things at midnight.

## Turning what was said into items

- **Split** one sentence into separate items only where there are clearly separate actions. "call the plumber and order hinge pins" is two. "call the plumber about the hinge pins" is one. Never split inside one action.
- **Day.** A day word goes with its own item: "tomorrow" means Tomorrow; "tonight" and "today" mean Today; "in the morning" means Tomorrow if it's after 6 pm where they are, otherwise Today. No day word means Today. Only Today and Tomorrow exist. For anything later, add it to Tomorrow and say so in the same line.
- **Words.** Tidy only enough to read as a to-do: drop filler ("um", "I need to", "remind me to", "add") and the day word itself. Keep their names, numbers and wording. Start lower case unless it's a name. Never add detail they didn't say.
- **After midnight and before 4 am,** "tomorrow" is the calendar tomorrow. Name the day in the reply: "Tomorrow (Sunday): …".
- **More than 8 items** in one go: list what you'll add and ask once before writing.

## What you say back

One line, no lead-in, nothing after it. Mid-chat, go straight back to the work.

| Said | You answer |
| --- | --- |
| `/today call the plumber` | Added to Today: call the plumber. |
| `/today call the plumber` when it's already open | Already on Today: call the plumber. |
| `/today order hinge pins tomorrow and email Sam` | Added to Today: email Sam. Tomorrow: order hinge pins. |
| `/today` or "what's on today" | **Today** 1. call the plumber 2. email Sam (2 days) · **Tomorrow** 1. order hinge pins |
| "done with the hinge pins" | Done: order hinge pins. |
| "done with the call" when two match | Two match: 1. call the plumber 2. call Mom. Which one? |
| Can't reach the repo | Couldn't reach your TODAY repo, so nothing was added: "order hinge pins". |
| Not set up | TODAY isn't set up here. Tell me your record repo, like yourname/Today-RECORD. |

**Already there.** If an unfinished item already says the same thing (ignoring case and spacing), don't add it again; say "Already on Today: …" (or Tomorrow). Add the rest of the sentence as usual.

**Only after it's saved.** Say "Added…", "Done…" or "Moved…" only once the save has gone through. If it didn't, say nothing was added and repeat their words.

"Done with", "finished" and "move … to tomorrow" act on the closest match. If two match, name both and ask; never guess.

## Privacy

The list is personal. Never copy item text into memory, a project file or another tool. The only thing you remember is the repo name.

## Where the list lives

### In Claude Code (a computer with `gh` signed in)

Use the helper beside this file. It does the reading, the writing and the safe retry; you pass it the items you worked out.

```
node <this skill folder>/today.mjs add --today "call the plumber" --tomorrow "order hinge pins"
node <this skill folder>/today.mjs list
node <this skill folder>/today.mjs list --json        # ids, for done / move / edit
node <this skill folder>/today.mjs done <id>
node <this skill folder>/today.mjs move <id>
node <this skill folder>/today.mjs edit <id> "new words"
node <this skill folder>/today.mjs setup yourname/Today-RECORD   # first time on a computer
```

Put all the items from one sentence in one `add` call, so they're one commit. The helper prints the reply line; say it as it is. To finish, move or edit, run `list --json` first and pick the id by meaning. If the helper says TODAY isn't set up, ask for the repo and run `setup`. It refuses a public repo.

### In the Claude app (phone, desktop, claude.ai) with the GitHub connector

Don't run `today.mjs` here; it's for Claude Code. Don't fetch github.com or api.github.com with code, curl or a web fetch either. The repo is private, so those ways can't see it and it will look missing. Use only the GitHub connector's own tools, and follow `record-format.md` beside this file exactly.

If no GitHub connector tools are available in this chat, don't try anything else. Say: "Turn on GitHub for this chat (the tools button below the message box), then say it again." Repeat their words so nothing is lost.

1. The repo name is the one they gave in this chat, or the one in your memory as "TODAY record: owner/name". If neither exists, ask once and save it.
2. Read `items.json` from that repo.
3. Change only what was asked: append new items (skipping any already open with the same words), or set `done`, `due` or `text` on the one you matched. Leave every other item and field exactly as it is.
4. Commit it with the message from `record-format.md`, like "Add: call the plumber".
5. If the commit is refused because the file changed, read it again, make the same change once more, and commit. If it's refused again, say nothing was saved.
6. If the connector can't read or write the repo, give the "Couldn't reach" line with their words, so nothing is lost.
