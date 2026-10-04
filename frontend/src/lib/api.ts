export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T
  let detail = `Request failed (${response.status})`
  try {
    const body = (await response.json()) as { detail?: string | { msg?: string }[] }
    if (typeof body.detail === 'string') detail = body.detail
    else if (Array.isArray(body.detail)) detail = body.detail.map((item) => item.msg).filter(Boolean).join('; ')
  } catch {
    // A non-JSON server error still has the HTTP status above.
  }
  throw new ApiError(detail, response.status)
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(path)
  if (!response.ok) { await parseResponse<never>(response); return }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
