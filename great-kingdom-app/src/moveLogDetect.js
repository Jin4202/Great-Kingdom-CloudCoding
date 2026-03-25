/**
 * detectMoveLogEntry
 *
 * Pure function that decides whether a new move-log entry should be
 * appended after a gameState transition.
 *
 * @param {object|null} prevState   - gameState before the update
 * @param {object}      nextState   - gameState after the update
 * @param {{ lastMove: {row,col}|null, passCount: number }} lastLogged
 *   - tracks the coordinates / passCount of the most recently written log entry
 *
 * @returns {{ player: number, type: 'place'|'pass', lastMove: object|null } | null}
 *
 * Key design decision: coordinates are compared by row/col value, NOT by
 * JSON.stringify.  The edge function returns lastMove as {row, col} while
 * Supabase's postgres_changes payload may return the same JSONB as {col, row}.
 * JSON.stringify is key-order sensitive, so string comparison would treat
 * identical coordinates as different and produce duplicate log entries.
 */
export function detectMoveLogEntry(prevState, nextState, lastLogged) {
  if (!prevState) return null

  const lm = nextState.lastMove
  const ll = lastLogged.lastMove

  if (lm != null) {
    const alreadyLogged =
      ll != null && ll.row === lm.row && ll.col === lm.col
    if (!alreadyLogged) {
      return { player: prevState.turn, type: 'place', lastMove: lm }
    }
  } else if (nextState.passCount > lastLogged.passCount) {
    return { player: prevState.turn, type: 'pass', lastMove: null }
  }

  return null
}
