# Changelog

What changed in each version of TODAY, newest first. Versions are x-numbers until release.

## x0.0.7 — 2026-11-07

The first web version, unlisted, at [woodwerd.github.io/today](https://woodwerd.github.io/today/).

- **Published** so it can be installed on a phone. It isn't in the All tools list yet.
- **Already there.** Saying something that's already on your list doesn't add it twice; Claude says "Already on Today".
- **Claude says it's added only after it's saved.** If the save didn't go through, it says so and repeats your words.
- **Examples** in the skill and the app use made-up names.

## x0.0.6 — 2026-11-07

Connects to your own GitHub repo. Kept on this computer. Not yet published.

- **Connect** with your repo's name and a fine-grained token for that one repo. The token stays on the device you typed it on and goes only to GitHub. A pasted github.com link works too.
- **Private only.** A public repo is turned down, with how to make it private, and every save checks again first.
- **Plain words when something's wrong:** a wrong name, a token that can only read, or a token that has expired. The list you last saw stays on screen, and changes wait.
- **Connect again** after a token expires keeps the changes that hadn't been sent, then sends them.

## x0.0.5 — 2026-11-07

Made for a laptop as well as a phone. Kept on this computer. Not yet published.

- **Check circles on a computer.** With a mouse or trackpad, every item has a circle at the left. Click it and the item is done, with Undo. Point at an item and a "→ Tomorrow" button shows at the right. The phone keeps swiping.
- **Paste a list.** Paste several lines into an add box and each line becomes its own item, in one save. Dashes, bullets, numbers and checkboxes at the start of a line are dropped.

## x0.0.4 — 2026-11-07

The app's screens. Kept on this computer. Not yet published.

- **Today and Tomorrow,** on a phone one above the other with an add bar at the bottom, and side by side on a computer with an add line in each. Light, dark, or match your computer.
- **Swipe right to finish, left to move.** Finishing shows ink with Done; moving shows grey with an arrow. Undo shows after either, until your next change.
- **Tap an item** to change its words or its day, or to finish or move it with a button instead of a swipe.
- **Keys on a computer:** arrows between items, Enter opens, D done, M move, Z undo.
- **Works offline.** Changes made offline show straight away, say "Not sent yet", and save when you're back online. If Claude adds something while your phone has an older copy, both are kept.
- **Installs to your home screen.** There's no connection to your GitHub repo yet; that's next. Open the page with `?standin` to try it with made-up items.

## x0.0.3 — 2026-11-07

The /today skill. Kept on this computer. Not yet published.

- **Say it to Claude.** "/today call the rep and order pins tomorrow" becomes two items, each on its own day, and Claude answers in one line. "/today" on its own lists the day. "Done with…" and "move… to tomorrow" work too.
- **In Claude Code,** a small helper does the saving through your GitHub sign-in, all of one sentence in one commit, with the same safe retry as the app.
- **In the Claude app,** the skill tells Claude how to edit your list through the GitHub connector, in exactly the same format.
- **Private only.** The skill refuses to write to a public repo.
- **Install** with `node tools/install-skill.mjs`.

## x0.0.2 — 2026-11-07

The list's rules, with tests. Kept on this computer. Not yet published.

- **Today and Tomorrow by date.** Anything due today or earlier shows under Today, so unfinished items roll over at midnight with nothing having to run. From the second day, a rolled item says how many days.
- **Add, finish, move, edit, and Undo for each.** Finished items stay in your file for 30 days, then leave it. Git history still has them.
- **Plain commit messages,** like "Add: call the rep" or "Done: order pins".
- **Safe saving from two places at once.** If your phone and Claude save at the same moment, the second one reads the list again and redoes just its own change, so neither is lost. A file that isn't a TODAY list is never written over.

## x0.0.1 — 2026-11-07

The start of the rebuild, kept on this computer. Not yet published.

- **The repo is set up.** The app, the `/today` skill, tools and tests each have a folder. The WOODWERD Digital tokens and bundled fonts are copied in from Filament Ctrl.
- **A layout test** checks that the folders are in place.
