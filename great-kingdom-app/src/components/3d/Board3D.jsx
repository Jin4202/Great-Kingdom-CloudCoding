// 10 lines per axis = borders of 9 cells (-4.5 … +4.5 in steps of 1)
const GRID_LINES = Array.from({ length: 10 }, (_, i) => -4.5 + i)

// Dark ink lines — classic painted-wood board style
const gridMat = {
  color:             '#2a1405',
  emissive:          '#100802',
  emissiveIntensity: 0.12,
  roughness:         0.82,
  metalness:         0,
}

// Table leg positions — four corners
const LEG_POSITIONS = [[-6.0, 6.0], [6.0, 6.0], [-6.0, -6.0], [6.0, -6.0]]

export default function Board3D() {
  return (
    <group>
      {/* ── Main slab — bright golden honey maple ───────────────────────────── */}
      <mesh position={[0, -0.14, 0]}>
        <boxGeometry args={[9.4, 0.28, 9.4]} />
        <meshStandardMaterial color="#d4a030" roughness={0.68} metalness={0} />
      </mesh>

      {/* ── Rim — darker walnut border ──────────────────────────────────────── */}
      <mesh position={[0, -0.155, 0]}>
        <boxGeometry args={[9.68, 0.02, 9.68]} />
        <meshStandardMaterial color="#8a5218" roughness={0.80} metalness={0} />
      </mesh>

      {/* ── Ink grid lines — horizontal ─────────────────────────────────────── */}
      {GRID_LINES.map(z => (
        <mesh key={`h${z}`} position={[0, 0.009, z]}>
          <boxGeometry args={[9.0, 0.013, 0.022]} />
          <meshStandardMaterial {...gridMat} />
        </mesh>
      ))}

      {/* ── Ink grid lines — vertical ───────────────────────────────────────── */}
      {GRID_LINES.map(x => (
        <mesh key={`v${x}`} position={[x, 0.009, 0]}>
          <boxGeometry args={[0.022, 0.013, 9.0]} />
          <meshStandardMaterial {...gridMat} />
        </mesh>
      ))}

      {/* ── Table top — lacquered rectangular oak, extends beyond board ──────── */}
      <mesh position={[0, -0.35, 0]}>
        <boxGeometry args={[14.2, 0.14, 14.2]} />
        <meshStandardMaterial color="#c8902a" roughness={0.28} metalness={0.04} />
      </mesh>

      {/* ── Table top surface gloss — bright highlight layer ─────────────────── */}
      <mesh position={[0, -0.279, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14.1, 14.1]} />
        <meshStandardMaterial color="#e0a830" roughness={0.18} metalness={0.05} depthWrite={false} />
      </mesh>

      {/* ── Table bottom edge — darker walnut frame strip ───────────────────── */}
      <mesh position={[0, -0.432, 0]}>
        <boxGeometry args={[14.5, 0.024, 14.5]} />
        <meshStandardMaterial color="#7a4810" roughness={0.70} metalness={0} />
      </mesh>

      {/* ── Table legs — four turned mahogany posts ──────────────────────────── */}
      {LEG_POSITIONS.map(([x, z], i) => (
        <mesh key={`leg-${i}`} position={[x, -0.76, z]}>
          <cylinderGeometry args={[0.26, 0.32, 0.64, 8]} />
          <meshStandardMaterial color="#6a3810" roughness={0.82} metalness={0} />
        </mesh>
      ))}

      {/* ── Far ground — blends with sky horizon ────────────────────────────── */}
      <mesh position={[0, -1.10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#87ceeb" roughness={0.90} metalness={0} />
      </mesh>
    </group>
  )
}
