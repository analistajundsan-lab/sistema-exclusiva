export function ChartPanel({
  title,
  subtitle,
  action,
  children,
  empty,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  empty?: boolean
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-tight text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {empty ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          Sem dados no período selecionado.
        </div>
      ) : (
        children
      )}
    </div>
  )
}
