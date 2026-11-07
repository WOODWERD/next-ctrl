# Next Ctrl

What to work on next: a list for today, and tomorrow. Say it to Claude from any chat with `/today`, or type it in the app. Anything not finished rolls over to today on its own.

- **On a phone:** swipe right to finish, swipe left to move it to the other day, tap to change it.
- **On a computer:** click the circle to finish, or point at an item to move it. Paste a list and each line becomes an item.

Your list lives in a private GitHub repo that you own, as one `items.json` file. Every change is a commit, so nothing is lost. There's no WOODWERD server and no account.

**Unlisted beta.** The app is at [woodwerd.github.io/next-ctrl](https://woodwerd.github.io/next-ctrl/). It isn't in the WOODWERD Toolkit's All tools list yet.

## Set up

1. Make a **private** repo, for example `yourname/Next-Ctrl-RECORD`. The app makes `items.json` on your first add.
2. Make a fine-grained GitHub token for that one repo, with Contents read and write. The [Set up GitHub guide](https://woodwerd.github.io/github.html) shows how.
3. Open the app and connect with the repo name and the token. Do this once on each device. The token stays on that device.
4. **For `/today` in the Claude app:** connect GitHub in Claude's settings, give it access to your repo, and upload the skill from `skill/` (zip the folder). The first time in a chat, Claude connects the repo and you approve it once.
5. **For `/today` in Claude Code:** `node tools/install-skill.mjs`, then `node ~/.claude/skills/today/today.mjs setup yourname/Next-Ctrl-RECORD`.

Part of the WOODWERD Toolkit. MIT License.
