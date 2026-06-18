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
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
        {action}
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
