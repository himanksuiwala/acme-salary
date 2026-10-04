import { Badge } from '@/components/ui/badge'
import type { PackageState } from './api'
import { packageLabels } from './format'

const variants: Record<PackageState, 'success' | 'info' | 'warning' | 'secondary'> = {
  CURRENT: 'success',
  SCHEDULED_CHANGE: 'info',
  SCHEDULED: 'info',
  PAST_ONLY: 'warning',
  NO_PACKAGE: 'secondary',
}

export function PackageBadge({ state }: { state: PackageState }) {
  return <Badge variant={variants[state]}>{packageLabels[state]}</Badge>
}
