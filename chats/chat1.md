# Badminton match tracking app

_Started 2026-09-22 18:46 UTC_

---

## User

Design a dark-theme mobile app for tracking badminton matches.

Use the uploaded color reference as the primary CTA/accent color. Keep the rest of the UI near-black, minimal, premium, and sporty. Avoid gradients, gaming aesthetics, and unnecessary decoration.

Use only 2 bottom tabs:

* Matches
* Insights

Top-right menu:

* Players
* Profile
* Settings

Main screen: **Matches**

* Summary: total matches + win rate
* Primary CTA: **+ Log Match**
* Filter: All / Singles / Doubles
* Match history cards showing players, score, Win/Loss, date

**Log Match flow**

1. Singles / Doubles
2. Select players from player database or add new player

   * Singles: Me vs Opponent
   * Doubles: Me + Partner vs Opponent 1 + Opponent 2
3. Enter score

   * Support 21 / 15 / 11 point formats
   * Support multiple games
4. Optional notes:

   * What worked?
   * Why did I lose points?
5. Save Match

**Match Detail**

* Players
* Score
* Win/Loss
* Date
* Notes
* H2H record against opponent

**Insights**

* Overall win rate
* Singles vs Doubles win rate
* Head-to-head leaderboard
* Partner win rates
* Simple trends from match history and notes

**Players**

* Search / add players
* Player profile with overall, singles, doubles H2H and recent matches

Prioritize fast score entry, clear hierarchy, large tap targets, and easy-to-scan data.

Core product model:
**Record matches → build history → understand performance**

Create only the key MVP screens and prototype the main flow:
**Matches → Log Match → Save → Match Detail**

## Assistant

_[tool: list_files]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

No color reference file was uploaded, so I'll use a lime accent as a placeholder and make it a tweak you can swap.

_[tool: dc_write]_

_[tool: show_html]_

_[tool: ready_for_verification]_

I've built the prototype as one clickable phone design. The full flow works: Matches → Log Match (4 steps) → Save → Match Detail. Insights, Players and Player Profile are also built. It's out for a final automated check now.

- **Accent colour:** your colour reference didn't reach the project, so I used a placeholder lime (#d4f25c). You can change it in Tweaks, or send the file and I'll set the exact colour.
- **Fast score entry:** for each game you tap "We Won" or "They Won", and the winner's score fills in automatically. Then you set the loser's score with large −/+ buttons. Extended games (deuce) are handled up to the cap: 30 for 21-point games, 21 for 15, and 15 for 11. You can add up to 3 games, and the screen shows the current result as you go.
- **Not built yet:** Profile and Settings are in the menu but only show a "Not in this prototype" message.
- **Tweaks:** accent colour, default points format (21 / 15 / 11), and which screen the prototype opens on.

