import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9', className)}>{children}</div>
}

export function PageHeader({
  title,
  description,
  titleAction,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  titleAction?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight">{title}</h1>
          {titleAction}
        </div>
        {description && <p className="mt-1.5 max-w-[65ch] text-[15px] leading-[22px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
