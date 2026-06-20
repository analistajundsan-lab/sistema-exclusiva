import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useCountUp } from '../../hooks/useCountUp'

type Color = 'brand' | 'red' | 'yellow' | 'green' | 'blue' | 'gray'

const COLORS: Record<Color, string> = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  yellow: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

export function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  color = 'brand',
  deltaPct,
  upIsBad = false,
  countUp = true,
  hint,
}: {
  label: string
  value: number | string
  suffix?: string
  icon: React.ElementType
  color?: Color
  deltaPct?: number
  upIsBad?: boolean
  countUp?: boolean
  hint?: string
}) {
  const shown = useCountUp(value, countUp)
  const showDelta = typeof deltaPct === 'number' && Number.isFinite(deltaPct)
  const up = (deltaPct ?? 0) > 0
  const down = (deltaPct ?? 0) < 0
  // Cor do delta: subir pode ser ruim (ex.: sinistros) ou bom, conforme upIsBad.
  const deltaGood = showDelta && ((up && !upIsBad) || (down && upIsBad))
  const deltaColor = !showDelta || deltaPct === 0
    ? 'text-gray-400'
    : deltaGood
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400'
  const DeltaIcon = deltaPct === 0 || !showDelta ? Minus : up ? ArrowUpRight : ArrowDownRight

  return (
    <div
      className="card card-hover p-4"
      title={hint}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <span className={`rounded-lg p-2 ${COLORS[color]}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-3xl font-bold leading-tight text-gray-900 dark:text-gray-100 tabular-nums">
          {shown}
          {suffix ? <span className="ml-0.5 text-base font-semibold text-gray-400">{suffix}</span> : null}
        </p>
        {showDelta && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${deltaColor}`}>
            <DeltaIcon size={13} />
            {Math.abs(deltaPct as number)}%
          </span>
        )}
      </div>
    </div>
  )
}
