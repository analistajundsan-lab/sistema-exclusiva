import { useEffect, useState } from 'react'

const ANIM_KEY = 'exclusiva_anim_date'

function alreadyShownToday(): boolean {
  try {
    return localStorage.getItem(ANIM_KEY) === new Date().toDateString()
  } catch {
    return false
  }
}

function markShownToday(): void {
  try {
    localStorage.setItem(ANIM_KEY, new Date().toDateString())
  } catch {
    // ignore
  }
}

const styles = `
  @keyframes busEnter {
    0%   { transform: translateX(110vw); }
    85%  { transform: translateX(-8px); }
    100% { transform: translateX(0); }
  }
  @keyframes busExit {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-110vw); }
  }
  @keyframes panelFadeIn {
    0%   { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes overlayFadeOut {
    0%   { opacity: 1; }
    100% { opacity: 0; }
  }

  .bus-intro-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: #00341b;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .bus-intro-overlay.fading-out {
    animation: overlayFadeOut 0.6s ease forwards;
  }

  .bus-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .bus-wrap.enter {
    animation: busEnter 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .bus-wrap.exit {
    animation: busExit 0.5s ease-in forwards;
  }
`

export function BusIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'exit' | 'fadeout' | 'done'>('enter')

  // If already shown today, skip immediately
  const skip = alreadyShownToday()

  useEffect(() => {
    if (skip) {
      onDone()
      return
    }

    markShownToday()

    // Phase: enter (0–700ms) → exit (700–1200ms) → fadeout (1200–1800ms) → done
    const t1 = setTimeout(() => setPhase('exit'), 700)
    const t2 = setTimeout(() => setPhase('fadeout'), 1200)
    const t3 = setTimeout(() => {
      setPhase('done')
      onDone()
    }, 1800)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (skip || phase === 'done') return null

  return (
    <>
      <style>{styles}</style>
      <div className={`bus-intro-overlay${phase === 'fadeout' ? ' fading-out' : ''}`}>
        <div className={`bus-wrap${phase === 'enter' ? ' enter' : phase === 'exit' ? ' exit' : ''}`}>
          <BusSvg />
        </div>
      </div>
    </>
  )
}

function BusSvg() {
  return (
    <svg
      viewBox="0 0 320 130"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: 'clamp(220px, 40vw, 320px)', height: 'auto' }}
      aria-hidden="true"
    >
      {/* Body */}
      <rect x="10" y="15" width="280" height="90" rx="12" ry="12" fill="#005528" />

      {/* Amber stripe */}
      <rect x="10" y="43" width="280" height="28" fill="#f29b00" />

      {/* EXCLUSIVA text on stripe */}
      <text
        x="150"
        y="62"
        textAnchor="middle"
        fill="#001f0e"
        fontSize="11"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
        letterSpacing="2"
      >
        EXCLUSIVA
      </text>

      {/* Windshield (front-left) */}
      <rect x="14" y="19" width="36" height="22" rx="4" fill="#b8e4ff" fillOpacity="0.75" />

      {/* Windows */}
      <rect x="60"  y="19" width="36" height="22" rx="4" fill="#b8e4ff" fillOpacity="0.7" />
      <rect x="104" y="19" width="36" height="22" rx="4" fill="#b8e4ff" fillOpacity="0.7" />
      <rect x="148" y="19" width="36" height="22" rx="4" fill="#b8e4ff" fillOpacity="0.7" />
      <rect x="192" y="19" width="36" height="22" rx="4" fill="#b8e4ff" fillOpacity="0.7" />

      {/* Front headlight */}
      <circle cx="18" cy="95" r="6" fill="#f5d060" />

      {/* Rear light */}
      <rect x="284" y="88" width="6" height="12" rx="2" fill="#ff4444" fillOpacity="0.85" />

      {/* Wheel left (rear) */}
      <circle cx="60"  cy="110" r="16" fill="#222" />
      <circle cx="60"  cy="110" r="8"  fill="#555" />
      <circle cx="60"  cy="110" r="3"  fill="#888" />

      {/* Wheel right (front) */}
      <circle cx="240" cy="110" r="16" fill="#222" />
      <circle cx="240" cy="110" r="8"  fill="#555" />
      <circle cx="240" cy="110" r="3"  fill="#888" />

      {/* Undercarriage shadow */}
      <rect x="26" y="104" width="258" height="4" rx="2" fill="#003318" fillOpacity="0.5" />

      {/* Door outline (front) */}
      <rect x="270" y="45" width="16" height="40" rx="3" fill="none" stroke="#003318" strokeWidth="1.5" />
      <line x1="278" y1="45" x2="278" y2="85" stroke="#003318" strokeWidth="1" />
    </svg>
  )
}
