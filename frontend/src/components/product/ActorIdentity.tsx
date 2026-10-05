import { useState } from 'react'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'
import { roleLabel } from '@/features/employees/format'
import type { AuditEvent } from '@/features/audit/api'
import { cn } from '@/lib/utils'

type Actor = AuditEvent['actor']

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : name.slice(0, 2)).toUpperCase()
}

export function ActorIdentity({ actor, className }: { actor: Actor; className?: string }) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  return <Popover open={hovered || pressed} onOpenChange={setPressed}>
    <PopoverTrigger render={<button
      type="button"
      className={cn('rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', className)}
      aria-label={`${actor.name}: show user details`}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false) }}
    />}>{actor.name}</PopoverTrigger>
    <PopoverPopup side="bottom" align="start" className="w-72 p-0" aria-label={`${actor.name} user details`}>
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{initials(actor.name)}</div>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5">{actor.name}</p>
          {actor.email && <p className="mt-0.5 break-all text-[13px] leading-5 text-muted-foreground">{actor.email}</p>}
          {actor.role && <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{roleLabel(actor.role)}</p>}
        </div>
      </div>
    </PopoverPopup>
  </Popover>
}
