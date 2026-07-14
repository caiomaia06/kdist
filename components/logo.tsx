interface LogoProps {
  /** Classe do tile do símbolo (tamanho, etc.) */
  className?: string
  /** Exibe o nome "KDISTRIBUTION" ao lado do símbolo */
  showWordmark?: boolean
  /** Classe do texto do wordmark */
  wordmarkClassName?: string
}

/**
 * Logo do KDISTRIBUTION — "K" estilizado com traços arredondados de
 * equalizador e barras de line distribution nas cores dos membros,
 * com pegada de estúdio de música / K-pop.
 */
export function Logo({
  className = 'size-10',
  showWordmark = false,
  wordmarkClassName = 'text-2xl',
}: LogoProps) {
  return (
    <span className="flex items-center gap-3">
      <svg
        viewBox="0 0 48 48"
        className={className}
        role="img"
        aria-label="Logo KDISTRIBUTION"
      >
        {/* Tile do estúdio */}
        <rect width="48" height="48" rx="12" className="fill-card" />
        <rect
          x="0.75"
          y="0.75"
          width="46.5"
          height="46.5"
          rx="11.25"
          fill="none"
          strokeWidth="1.5"
          className="stroke-primary/40"
        />
        {/* Glow sutil atrás do K */}
        <circle cx="21" cy="24" r="15" className="fill-primary/15" />
        {/* Haste do K */}
        <rect x="9" y="8" width="7" height="32" rx="3.5" className="fill-primary" />
        {/* Diagonais do K com pontas arredondadas (traço de equalizador) */}
        <path
          d="M20 24 L33 11"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          className="stroke-primary"
        />
        <path
          d="M20 24 L33 37"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          className="stroke-primary"
        />
        {/* Barras de line distribution (cores dos membros) */}
        <rect x="38.5" y="18" width="4" height="12" rx="2" fill="#ffd166" />
        <rect x="38.5" y="7" width="4" height="8" rx="2" fill="#4dd6ff" opacity="0.9" />
        <rect x="38.5" y="33" width="4" height="8" rx="2" fill="#7bffb2" opacity="0.9" />
      </svg>
      {showWordmark && (
        <span
          className={`font-bold tracking-tight text-balance ${wordmarkClassName}`}
        >
          <span className="text-primary">K</span>DISTRIBUTION
        </span>
      )}
    </span>
  )
}
