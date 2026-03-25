import { animated, useSpring } from '@react-spring/three'
import { BLUE, NEUTRAL } from '../../gameLogic'

// ── Shared geometry constants ───────────────────────────────────────────────

export const PIECE_Y    = 0.15
export const BOARD_HALF = 4.0
export const CELL_SIZE  = 1.0

export function cellPos(row, col) {
  return [
    (col - BOARD_HALF) * CELL_SIZE,
    0,
    (row - BOARD_HALF) * CELL_SIZE,
  ]
}

// ── Materials ────────────────────────────────────────────────────────────────

// Blue tower — rich cobalt with shadowed details
const B_BASE = { color: '#1a509a', roughness: 0.82, metalness: 0 }
const B_BODY = { color: '#2e78d0', roughness: 0.78, metalness: 0 }
const B_MID  = { color: '#3a88e0', roughness: 0.76, metalness: 0 }
const B_TOP  = { color: '#1a4e8a', roughness: 0.84, metalness: 0 }
const B_SLIT = { color: '#0a1828', roughness: 0.95, metalness: 0 }

// Red keep — vivid crimson with shadowed details
const O_BASE = { color: '#7a0c0c', roughness: 0.82, metalness: 0 }
const O_BODY = { color: '#cc2020', roughness: 0.78, metalness: 0 }
const O_MID  = { color: '#e03030', roughness: 0.76, metalness: 0 }
const O_TOP  = { color: '#9a1010', roughness: 0.84, metalness: 0 }
const O_SLIT = { color: '#200808', roughness: 0.95, metalness: 0 }

// Neutral castle
const CASTLE_BODY = { color: '#c8bfb0', roughness: 0.90, metalness: 0 }
const CASTLE_GOLD = {
  color: '#c8a020', emissive: '#906010', emissiveIntensity: 0.50,
  roughness: 0.78, metalness: 0,
}

// ── Piece angles ─────────────────────────────────────────────────────────────

// 8 merlons evenly spaced around the parapet
const MERLONS_8 = Array.from({ length: 8 }, (_, i) => (Math.PI * i) / 4)
// 4 arrow slits at cardinal points (8-sided tower faces at 0, π/2, π, 3π/2)
const SLITS_CARDINAL = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2]
// 4 arrow slits at 45° faces of the square keep
const SLITS_DIAGONAL = [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]

// ── Component ────────────────────────────────────────────────────────────────

export default function Piece3D({ row, col, color, isCapturing = false }) {
  const [wx, , wz] = cellPos(row, col)
  const isNeutral  = color === NEUTRAL

  const { posY, sc } = useSpring({
    from: { posY: isCapturing ? PIECE_Y : PIECE_Y + 3.8, sc: 1 },
    posY: isCapturing ? PIECE_Y + 0.75 : PIECE_Y,
    sc:   isCapturing ? 0 : 1,
    config: isCapturing
      ? { tension: 90,  friction: 16 }
      : { tension: 210, friction: 22 },
  })

  return (
    <animated.group position-x={wx} position-y={posY} position-z={wz} scale={sc}>
      {isNeutral
        ? <NeutralCastle />
        : color === BLUE
          ? <BlueTower />
          : <RedKeep />
      }
    </animated.group>
  )
}

// ── Blue — octagonal round tower, two-tier with arrow slits ──────────────────
//
// Local Y layout (group at PIECE_Y = 0.15 in world, so local y=-0.15 = board surface):
//   -0.15 → -0.09  foundation slab
//   -0.09 → +0.07  lower body (r 0.26–0.30)
//   +0.07          string course ring (thin belt)
//   +0.07 → +0.21  upper body (r 0.21–0.26) + arrow slits
//   +0.21 → +0.25  parapet ring
//   +0.25 → +0.34  8 merlons

function BlueTower() {
  return (
    <>
      {/* Foundation slab */}
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.36, 0.40, 0.06, 8]} />
        <meshStandardMaterial {...B_BASE} />
      </mesh>

      {/* Lower body */}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.26, 0.30, 0.18, 8]} />
        <meshStandardMaterial {...B_BODY} />
      </mesh>

      {/* String course — thin decorative belt between tiers */}
      <mesh position={[0, +0.09, 0]}>
        <cylinderGeometry args={[0.295, 0.295, 0.022, 8]} />
        <meshStandardMaterial {...B_TOP} />
      </mesh>

      {/* Upper body */}
      <mesh position={[0, +0.165, 0]}>
        <cylinderGeometry args={[0.21, 0.26, 0.15, 8]} />
        <meshStandardMaterial {...B_MID} />
      </mesh>

      {/* Arrow slits — 4 narrow dark slots on upper body faces */}
      {SLITS_CARDINAL.map((a, i) => (
        <mesh
          key={`slit-${i}`}
          position={[Math.sin(a) * 0.235, +0.165, Math.cos(a) * 0.235]}
          rotation={[0, -a, 0]}
        >
          <boxGeometry args={[0.048, 0.10, 0.01]} />
          <meshStandardMaterial {...B_SLIT} />
        </mesh>
      ))}

      {/* Parapet walkway ring */}
      <mesh position={[0, +0.25, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.04, 8]} />
        <meshStandardMaterial {...B_TOP} />
      </mesh>

      {/* 8 merlons evenly around the parapet */}
      {MERLONS_8.map((a, i) => (
        <mesh key={`m-${i}`} position={[Math.sin(a) * 0.20, +0.300, Math.cos(a) * 0.20]}>
          <boxGeometry args={[0.080, 0.090, 0.080]} />
          <meshStandardMaterial {...B_TOP} />
        </mesh>
      ))}
    </>
  )
}

// ── Red — square keep, two-tier with corbel course and arrow slits ─────────
//
// Same Y layout as BlueTower.

function RedKeep() {
  return (
    <>
      {/* Foundation slab — square */}
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.37, 0.41, 0.06, 4]} />
        <meshStandardMaterial {...O_BASE} />
      </mesh>

      {/* Lower body */}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.27, 0.31, 0.18, 4]} />
        <meshStandardMaterial {...O_BODY} />
      </mesh>

      {/* Corbel course — slight outward flange, gives weight before parapet */}
      <mesh position={[0, +0.09, 0]}>
        <cylinderGeometry args={[0.31, 0.28, 0.022, 4]} />
        <meshStandardMaterial {...O_TOP} />
      </mesh>

      {/* Upper body */}
      <mesh position={[0, +0.165, 0]}>
        <cylinderGeometry args={[0.22, 0.27, 0.15, 4]} />
        <meshStandardMaterial {...O_MID} />
      </mesh>

      {/* Arrow slits — 4 slots on diagonal faces of the square keep */}
      {SLITS_DIAGONAL.map((a, i) => (
        <mesh
          key={`slit-${i}`}
          position={[Math.sin(a) * 0.238, +0.165, Math.cos(a) * 0.238]}
          rotation={[0, -a, 0]}
        >
          <boxGeometry args={[0.050, 0.10, 0.01]} />
          <meshStandardMaterial {...O_SLIT} />
        </mesh>
      ))}

      {/* Parapet walkway ring */}
      <mesh position={[0, +0.25, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.04, 4]} />
        <meshStandardMaterial {...O_TOP} />
      </mesh>

      {/* 8 merlons — 4 at corners + 4 at face centres */}
      {MERLONS_8.map((a, i) => (
        <mesh key={`m-${i}`} position={[Math.sin(a) * 0.22, +0.300, Math.cos(a) * 0.22]}>
          <boxGeometry args={[0.085, 0.090, 0.085]} />
          <meshStandardMaterial {...O_TOP} />
        </mesh>
      ))}
    </>
  )
}

// ── Neutral castle — stacked octagonal pagoda ─────────────────────────────────

function NeutralCastle() {
  return (
    <>
      <mesh position={[0, -0.065, 0]}>
        <cylinderGeometry args={[0.36, 0.43, 0.1, 8]} />
        <meshStandardMaterial {...CASTLE_BODY} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.23, 0.34, 0.22, 8]} />
        <meshStandardMaterial {...CASTLE_BODY} />
      </mesh>
      <mesh position={[0, 0.20, 0]}>
        <coneGeometry args={[0.26, 0.11, 8]} />
        <meshStandardMaterial {...CASTLE_GOLD} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial {...CASTLE_GOLD} />
      </mesh>
    </>
  )
}
