// Inline SVG icons (no icon font / external requests - keeps the strict CSP intact).
type P = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconCircle = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
  </svg>
);

export const IconProgress = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCheck = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </svg>
);

export const IconLayers = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const IconArrowLeft = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M15 18 9 12l6-6" />
  </svg>
);

export const IconArrowRight = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconTrash = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

export const IconPlus = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconBolt = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);

export const IconClock = ({ className }: P) => (
  <svg {...base} width={14} height={14} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Logo = ({ className }: P) => (
  <svg width="40" height="40" viewBox="0 0 40 40" className={className} aria-hidden>
    <defs>
      <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6366f1" />
        <stop offset="0.5" stopColor="#a855f7" />
        <stop offset="1" stopColor="#ec4899" />
      </linearGradient>
    </defs>
    <rect width="40" height="40" rx="11" fill="url(#logo-g)" />
    <rect x="9" y="10" width="6" height="20" rx="2" fill="#fff" opacity="0.95" />
    <rect x="17" y="10" width="6" height="14" rx="2" fill="#fff" opacity="0.8" />
    <rect x="25" y="10" width="6" height="9" rx="2" fill="#fff" opacity="0.65" />
  </svg>
);
