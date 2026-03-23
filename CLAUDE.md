# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Great Kingdom** is a 2-player strategy board game created by Lee Se-dol (9-dan professional Go player), published by Korea Boardgames (Wizstone Series). This repository is currently in the **specification phase** — it contains only the complete game rules document and no implementation code yet.

The core spec is in `great_kingdom_rules_EN.md`.

## Game Rules Summary

- **Board**: 9×9 grid with 1 neutral castle fixed at the center
- **Players**: Blue (40 castles) vs Orange (40 castles)
- **Win by capture**: Encircling any enemy piece ends the game immediately — the capturing player wins
- **Win by territory**: If both players pass consecutively, territory is counted; first player has a −3 handicap
- **Key mechanic**: A group is "alive" if it has at least one eye (even a false eye), unlike Go which requires two eyes
- **No-entry rule**: Players cannot place in territory fully controlled by the opponent
- **No Ko rule**: Unlike Go, there is no Ko restriction

## Proposed Data Model

```javascript
{
  board: number[][],        // 9×9 grid: 0=empty, 1=blue, 2=orange, 3=neutral
  territory: number[][],    // 9×9 grid: territory ownership per cell
  turn: 'blue' | 'orange',
  passCount: number,
  blueTerritory: number,
  orangeTerritory: number,
  gameOver: boolean,
  winner: 'blue' | 'orange' | null
}
```

## Core Algorithms Needed

- **Encirclement detection**: BFS/DFS flood-fill to determine if a group is fully surrounded
- **Territory calculation**: Flood-fill from empty regions to determine which player controls each area
- **Move validation**: Prevent placement in opponent-controlled territory
- **Win condition check**: After each placement, check if any enemy group has been captured

## Game Flow

```
[Piece Placed]
      ↓
[Encirclement Check] → Enemy captured? → YES → Game Over: Current Player Wins
      ↓ NO
[Update Territory]
      ↓
[Update No-Entry Zones]
      ↓
[Switch Turn]
      ↓
[Both Passed?] → YES → Territory Count → First player −3 → Winner
      ↓ NO
[Continue]
```
