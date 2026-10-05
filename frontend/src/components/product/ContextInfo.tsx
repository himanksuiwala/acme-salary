import { useState, type ReactNode } from 'react'
import { InfoIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'

export function ContextInfo({ label, children }: { label: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  return <Popover open={hovered || pressed} onOpenChange={setPressed}>
    <PopoverTrigger render={<Button type="button" size="icon-sm" variant="ghost" className="size-10 shrink-0 sm:size-8" aria-label={label} onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true) }} onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false) }} />}><InfoIcon aria-hidden="true" size={17} /></PopoverTrigger>
    <PopoverPopup tooltipStyle side="bottom" align="start" className="max-w-80 leading-5" aria-label={label}>{children}</PopoverPopup>
  </Popover>
}
