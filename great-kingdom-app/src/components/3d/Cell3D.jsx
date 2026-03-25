import { useState } from 'react'
import { EMPTY, BLUE, RED, NEUTRAL } from '../../gameLogic'
import { cellPos, PIECE_Y, CELL_SIZE } from './Piece3D'

// ── Cell3D ────────────────────────────────────────────────────────────────────
//
// Renders per-cell 3D interactivity on the board surface:
//   • Invisible hit plane for click / hover events
//   • Territory tint overlay (blue / red)
//   • Suicide cell overlay (red)
//   • Last-move ring (glowing ring on board surface)
//   • Hover ghost piece (semi-transparent preview stone)

export default function Cell3D({
  row, col,
  cell, terrOwner,
  turn,
  onCellClick,
  isLast,
  gameOver,
  isSuicide,
  isOpponentTurn,
}) {
  const [hovered, setHovered] = useState(false)
  const [x, , z] = cellPos(row, col)

  const opponent  = turn === BLUE ? RED : BLUE
  const isBlocked = cell === EMPTY && terrOwner === opponent
  const canPlace  = cell === EMPTY && !isBlocked && !isSuicide && !gameOver && !isOpponentTurn

  return (
    <group>
      {/* ── Invisible hit plane ─────────────────────────────────────────────── */}
      <mesh
        position={[x, 0.025, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={canPlace ? (e) => { e.stopPropagation(); onCellClick(row, col) } : undefined}
        onPointerEnter={canPlace ? () => setHovered(true) : undefined}
        onPointerLeave={() => setHovered(false)}
      >
        <planeGeometry args={[CELL_SIZE * 0.98, CELL_SIZE * 0.98]} />
        {/* transparent but still raycasted */}
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* ── Territory tint ──────────────────────────────────────────────────── */}
      {terrOwner === BLUE && (
        <mesh position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CELL_SIZE * 0.88, CELL_SIZE * 0.88]} />
          <meshBasicMaterial color="#7ec3f5" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
      {terrOwner === RED && (
        <mesh position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CELL_SIZE * 0.88, CELL_SIZE * 0.88]} />
          <meshBasicMaterial color="#f87171" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}

      {/* ── Suicide / blocked tint ──────────────────────────────────────────── */}
      {isSuicide && (
        <mesh position={[x, 0.007, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CELL_SIZE * 0.82, CELL_SIZE * 0.82]} />
          <meshBasicMaterial color="#ff2211" transparent opacity={0.20} depthWrite={false} />
        </mesh>
      )}
      {isBlocked && (
        <mesh position={[x, 0.007, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CELL_SIZE * 0.82, CELL_SIZE * 0.82]} />
          <meshBasicMaterial
            color={opponent === BLUE ? '#7ec3f5' : '#f87171'}
            transparent opacity={0.08}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ── Last-move ring (stays on board surface, not attached to piece) ──── */}
      {isLast && cell !== EMPTY && cell !== NEUTRAL && (
        <mesh position={[x, 0.015, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.27, 0.43, 40]} />
          <meshBasicMaterial
            color={cell === BLUE ? '#aadeff' : '#fca5a5'}
            transparent opacity={0.72}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ── Hover ghost piece ───────────────────────────────────────────────── */}
      {hovered && canPlace && <GhostPiece x={x} z={z} turn={turn} />}
    </group>
  )
}

// ── Ghost piece ───────────────────────────────────────────────────────────────

function GhostPiece({ x, z, turn }) {
  const isBlue  = turn === BLUE
  const color   = isBlue ? '#7ec3f5' : '#f87171'
  const sides   = isBlue ? 8 : 4          // round tower vs square keep
  const radTop  = isBlue ? 0.21 : 0.22
  const radBot  = isBlue ? 0.30 : 0.31
  return (
    <mesh position={[x, PIECE_Y + 0.10, z]}>
      <cylinderGeometry args={[radTop, radBot, 0.48, sides]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.38}
        roughness={0.85}
        metalness={0}
        depthWrite={false}
      />
    </mesh>
  )
}
