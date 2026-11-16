'use client'

import { useLayoutEffect, useRef, useSyncExternalStore, type ComponentPropsWithoutRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

let openModals = 0
let previousOverflow = ''
const subscribe = () => () => {}

/** Native modal dialogs provide top-layer stacking, inert background content,
 * focus containment, and focus restoration, including nested dialogs. */
export function Modal({ onClose, children, className, dismissible = true, ...props }: Omit<ComponentPropsWithoutRef<'dialog'>, 'onClose'> & {
  onClose: () => void
  dismissible?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  if (!triggerRef.current && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) triggerRef.current = document.activeElement
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    const dialog = ref.current
    const trigger = triggerRef.current
    if (!dialog) return
    if (openModals++ === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    dialog.showModal()
    return () => {
      dialog.close()
      if (--openModals === 0) document.body.style.overflow = previousOverflow
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [mounted])
  if (!mounted) return null
  return createPortal(<dialog
    {...props}
    ref={ref}
    dir="rtl"
    aria-modal="true"
    className={cn('modal-surface', className)}
    onCancel={(event) => {
      event.preventDefault()
      event.stopPropagation()
      if (dismissible) closeRef.current()
    }}
    onKeyDown={(event) => {
      event.stopPropagation()
      props.onKeyDown?.(event)
      if (event.key !== 'Tab' || event.defaultPrevented) return
      const dialog = ref.current
      if (!dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'))
      const first = items[0], last = items.at(-1)
      if (!first || !last) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}
  >{children}</dialog>, document.body)
}
