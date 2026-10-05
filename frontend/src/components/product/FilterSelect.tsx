import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'

type FilterOption = { value: string; label: string }

const defaultEmptyLabels: Record<string, string> = {
  Country: 'All countries',
  Department: 'All departments',
  Role: 'All roles',
  Status: 'All statuses',
  Package: 'All package states',
  Location: 'All locations',
}

export function FilterSelect({
  label,
  value,
  values,
  onChange,
  emptyLabel = defaultEmptyLabels[label] ?? `All ${label.toLowerCase()}`,
  selectClassName,
  showLabel = true,
  stacked = true,
  size,
}: {
  label: string
  value: string
  values: FilterOption[]
  onChange: (value: string) => void
  emptyLabel?: string
  selectClassName?: string
  showLabel?: boolean
  stacked?: boolean
  size?: 'default' | 'sm' | 'lg'
}) {
  const selectedLabel = values.find((item) => item.value === value)?.label ?? (value || emptyLabel)

  return (
    <div className={stacked ? 'min-w-0' : 'flex min-w-0 shrink-0 items-center gap-1.5'}>
      {showLabel && (
        <span className={stacked ? 'mb-1.5 block text-[13px] font-medium text-muted-foreground' : 'shrink-0 text-[13px] font-medium text-muted-foreground'}>
          {label}{stacked ? '' : ':'}
        </span>
      )}
      <Select value={value || 'all'} onValueChange={(next) => onChange(next === 'all' || next === null ? '' : String(next))}>
        <SelectTrigger aria-label={label} title={selectedLabel} size={size ?? (stacked ? 'default' : 'sm')} className={`min-w-0 ${selectClassName ?? 'w-full'}`}>
          <SelectValue>{(selected: string | null) => selected === 'all' || selected === null ? emptyLabel : values.find((item) => item.value === selected)?.label ?? selected}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="all">{emptyLabel}</SelectItem>
          {value && !values.some((item) => item.value === value) && <SelectItem value={value}>{selectedLabel}</SelectItem>}
          {values.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
        </SelectPopup>
      </Select>
    </div>
  )
}
