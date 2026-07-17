import { status } from 'elysia'

// Standard success envelope: { success: true, message, data }
export const ok = <T>(data: T, message: string) => ({
  success: true as const,
  message,
  data,
})

// Standard error envelope: { success: false, message, data: null }
// `errors` carries optional structured validation/context details.
export const fail = (code: number, message: string, errors?: unknown) =>
  status(code, { success: false as const, message, ...(errors !== undefined ? { errors } : {}), data: null })
