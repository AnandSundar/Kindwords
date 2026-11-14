---
title: Testing the form and wall with a real screen reader (NVDA) from an agent session
date: 2026-11-14
category: workflow-issues
module: accessibility testing
problem_type: workflow_issue
component: testing_framework
severity: medium
applies_when:
  - Checking what a screen reader actually announces, beyond the roles and names Playwright asserts
  - Running on Windows with Chrome, driven by an agent rather than a person at the keyboard
tags: [nvda, screen-reader, accessibility, chrome, windows, a11y-testing]
---

# Testing the form and wall with a real screen reader (NVDA) from an agent session

## Context

The Playwright e2e test checks accessible roles and names, but it cannot tell what a screen reader says. A real NVDA pass on the collection form and the embed found two bugs the tests had missed: the rating radios were read as "1star", "2stars" (a flex label drops a separate `" "` text node from the accessible name), and every wall card was read only as "figure", so "Read more" had no context. Getting NVDA to produce readable evidence took several dead ends worth not repeating.

## Guidance

1. **Download the signed launcher** from download.nvaccess.org into its own folder and check `Get-AuthenticodeSignature` reports `NV Access Limited`. The launcher's license dialog is the user's to accept, not the agent's.
2. **Make a portable copy; do not use "Continue running".** The temporary copy started from the launcher dialog ignores command-line options, logs to `%TEMP%\nvda.log` at the default level, and runs from a temp folder the launcher deletes when it exits (copying that folder races the deletion). After the user has accepted the license once:

   ```powershell
   nvda_2026.3.1.exe --create-portable-silent --portable-path="<scratch>\nvda-portable"
   ```

3. **Run it silent, isolated and logging speech:**

   ```powershell
   "<scratch>\nvda-portable\nvda.exe" -c "<scratch>\nvda-config" -l 12 -f "<scratch>\nvda.log"
   ```

   with `<scratch>\nvda-config\nvda.ini`:

   ```ini
   [general]
   showWelcomeDialogAtStartup = False
   [speech]
   synth = silence
   [update]
   autoCheck = False
   allowUsageStats = False
   askedAllowUsageStats = True
   ```

   Log level 12 (input/output) writes every utterance as `Speaking [...]` even with the silent synth, so nothing plays aloud and the log is the transcript. Count `Speaking` lines before each step and print only the new ones.
4. **Put Chrome in front.** NVDA follows the foreground window only. Claude in Chrome drives a background window, so bring Chrome forward first (computer-use `open_application`, which works at the browser's read tier). Computer-use cannot target the portable NVDA itself, since it is not an installed app.
5. **Reload the page after NVDA is running.** A page loaded before NVDA started stays silent, because Chrome builds its accessibility tree for it only once an assistive technology is present.
6. **Drive with focus-moving keys.** Keys sent through the extension (Tab, arrows, Space, Enter) move real DOM focus, and NVDA announces each focus change, which is how forms are used. NVDA's own browse-mode keys (H, virtual-cursor arrows) never reach NVDA this way, so headings-only navigation stays untested.
7. **Clean up.** The log also captures titles of the user's other windows: delete it with the config and portable folders. The NVDA helper DLL stays locked in running apps until they restart.

## Why This Matters

Without steps 2, 4 and 5, the run looks like it works but produces no speech for the page, and it is easy to conclude the page is silent or the tooling is broken. With them, a full form and wall pass takes minutes and gives quotable output.

## When to Apply

- Before release, or after changing labels, landmarks or the widget's markup.
- Not a substitute for VoiceOver on macOS or for a person using NVDA's browse mode.

## Examples

What NVDA said for the rating group before and after the fix in `src/app/c/[publicId]/submit-form.tsx`:

```
before: ['1star', 'radio button', 'not checked', 'required', 'invalid entry', '1 of 5']
after:  ['1 star', 'radio button', 'not checked', 'required', 'invalid entry', '1 of 5']
```

And for a wall card, after naming each card in `widget/src/render.ts`:

```
['Testimonials', 'region', 'Testimonial from Jonas Weber', 'figure', 'Read more', 'button', 'collapsed']
```

Expected, not bugs: Chrome reports untouched required radios and checkboxes as "invalid entry"; NVDA's read-on-load passes the embed region as empty when the widget has not rendered yet.

## Related

- `tests/e2e/collect-approve-embed.spec.ts` asserts the "1 star" name and the card's aria-label, so these two regressions now fail CI.
