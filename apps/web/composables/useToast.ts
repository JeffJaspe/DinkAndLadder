/**
 * Toast queue.
 *
 * The mockups show three variants — "Match submitted successfully!",
 * "Rating updated! +12 points", "Failed to submit match" — which are all
 * *outcome confirmations* for an action the user just took. That is the rule
 * for using this: confirm something that happened, never announce something
 * the user can already see.
 *
 * State lives in `useState` so every caller shares one queue and the renderer
 * in the layout is the only thing that draws them.
 */

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  variant: ToastVariant
  message: string
  /** ms before auto-dismiss; errors stay until dismissed. */
  timeout: number
}

let nextId = 1

const DEFAULT_TIMEOUT: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  // Errors persist: they usually carry an instruction, and a message that
  // vanishes before it is read is worse than no message.
  error: 0
}

export function useToast() {
  const toasts = useState<Toast[]>('dnl:toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(variant: ToastVariant, message: string, timeout?: number) {
    const toast: Toast = {
      id: nextId++,
      variant,
      message,
      timeout: timeout ?? DEFAULT_TIMEOUT[variant]
    }

    // Cap the stack. A burst of failures should not paper over the page.
    toasts.value = [...toasts.value, toast].slice(-4)

    if (import.meta.client && toast.timeout > 0) {
      window.setTimeout(() => dismiss(toast.id), toast.timeout)
    }
    return toast.id
  }

  return {
    toasts,
    dismiss,
    success: (message: string, timeout?: number) => push('success', message, timeout),
    error: (message: string, timeout?: number) => push('error', message, timeout),
    info: (message: string, timeout?: number) => push('info', message, timeout),
    clear: () => {
      toasts.value = []
    }
  }
}
