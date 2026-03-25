import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { EMPTY, NEUTRAL, BOARD_SIZE } from '../../gameLogic'
import Board3D from './Board3D'
import Piece3D from './Piece3D'
import Cell3D from './Cell3D'

// ── Camera setup ─────────────────────────────────────────────────────────────

function CameraSetup() {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(0, 0, 0)
  }, [camera])
  return null
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function Scene({
  board, territory, turn, onCellClick,
  lastMove, gameOver, suicideCells, isOpponentTurn,
  capturedPieces,
}) {
  if (!board) return null

  return (
    <>
      {/* ── Sky ─────────────────────────────────────────────────────────────── */}
      <color attach="background" args={['#87ceeb']} />
      {/* Fog dissolves the ground into the sky horizon */}
      <fog attach="fog" args={['#87ceeb', 26, 56]} />

      {/* ── Lighting — bright open-air daylight ─────────────────────────────── */}
      {/* Sky fill — cool blue ambient from the sky */}
      <ambientLight color="#d8eeff" intensity={3.4} />
      {/* Sun key — strong, slightly warm overhead */}
      <directionalLight position={[3, 14, 6]} color="#fffdf8" intensity={2.2} />
      {/* Bounce fill — warm table-surface reflection */}
      <directionalLight position={[-4, 3, -3]} color="#ffe8c0" intensity={0.9} />
      {/* Sky rim — cool blue, adds aerial depth */}
      <directionalLight position={[0, 5, -10]} color="#b8d8f8" intensity={0.5} />

      {/* ── Board geometry ───────────────────────────────────────────────────── */}
      <Board3D />

      {/* ── Active pieces ───────────────────────────────────────────────────── */}
      {board.map((row, r) =>
        row.map((cell, c) => {
          if (cell === EMPTY) return null
          return (
            <Piece3D
              key={`piece-${r}-${c}`}
              row={r} col={c}
              color={cell}
              isCapturing={false}
            />
          )
        })
      )}

      {/* ── Captured pieces — animate out for 900 ms after a capture win ───── */}
      {capturedPieces.map(p => (
        <Piece3D
          key={`cap-${p.row}-${p.col}`}
          row={p.row} col={p.col}
          color={p.color}
          isCapturing={true}
        />
      ))}

      {/* ── Per-cell interaction + overlays ─────────────────────────────────── */}
      {Array.from({ length: BOARD_SIZE }, (_, r) =>
        Array.from({ length: BOARD_SIZE }, (_, c) => (
          <Cell3D
            key={`cell-${r}-${c}`}
            row={r} col={c}
            cell={board[r][c]}
            terrOwner={territory?.[r]?.[c] ?? 0}
            turn={turn}
            onCellClick={onCellClick}
            isLast={lastMove?.row === r && lastMove?.col === c}
            gameOver={gameOver}
            isSuicide={suicideCells?.[r]?.[c] ?? false}
            isOpponentTurn={isOpponentTurn}
          />
        ))
      )}

      {/* ── Post-processing ─────────────────────────────────────────────────── */}
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.72} luminanceSmoothing={0.05} intensity={0.40} radius={0.65} />
        <Vignette offset={0.44} darkness={0.22} />
      </EffectComposer>
    </>
  )
}

// ── GameCanvas ────────────────────────────────────────────────────────────────

export default function GameCanvas({
  board,
  territory,
  turn,
  onCellClick,
  lastMove,
  gameOver,
  winReason,
  suicideCells,
  isOpponentTurn = false,
}) {
  const prevBoardRef   = useRef(null)
  const [capturedPieces, setCapturedPieces] = useState([])

  useEffect(() => {
    if (gameOver && winReason === 'capture' && prevBoardRef.current) {
      const prev    = prevBoardRef.current
      const removed = []
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const wasOccupied  = prev[r][c] !== EMPTY && prev[r][c] !== NEUTRAL
          const nowEmpty     = board[r][c] === EMPTY
          if (wasOccupied && nowEmpty) removed.push({ row: r, col: c, color: prev[r][c] })
        }
      }
      if (removed.length > 0) {
        setCapturedPieces(removed)
        const t = setTimeout(() => setCapturedPieces([]), 900)
        return () => clearTimeout(t)
      }
    }
  }, [gameOver]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gameOver) prevBoardRef.current = board
  })

  return (
    <div className="canvas-container">
      <Canvas
        camera={{ position: [0, 17, 7], fov: 44, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: false }}
      >
        <CameraSetup />
        <Scene
          board={board}
          territory={territory}
          turn={turn}
          onCellClick={onCellClick}
          lastMove={lastMove}
          gameOver={gameOver}
          suicideCells={suicideCells}
          isOpponentTurn={isOpponentTurn}
          capturedPieces={capturedPieces}
        />
      </Canvas>
    </div>
  )
}
