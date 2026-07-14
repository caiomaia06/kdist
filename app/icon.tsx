import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// Favicon dinâmico: "K" estilizado com barras de equalizador,
// nas cores do tema (primary rosa neon sobre fundo escuro do estúdio)
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#17131f',
        borderRadius: 7,
      }}
    >
      <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
        {/* Haste do K */}
        <rect x="9" y="8" width="7" height="32" rx="3.5" fill="#ff4d8d" />
        {/* Diagonais do K */}
        <path
          d="M20 24 L34 10"
          stroke="#ff4d8d"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M20 24 L34 38"
          stroke="#ff4d8d"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {/* Barras de equalizador (line distribution) */}
        <rect x="39" y="19" width="4" height="10" rx="2" fill="#ffd166" />
        <rect x="39" y="8" width="4" height="8" rx="2" fill="#4dd6ff" opacity="0.9" />
        <rect x="39" y="32" width="4" height="8" rx="2" fill="#7bffb2" opacity="0.9" />
      </svg>
    </div>,
    { ...size },
  )
}
