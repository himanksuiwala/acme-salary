import { useState, type FormEvent } from 'react'
import { ArrowRightIcon, LockKeyIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn, type AuthenticatedUser } from './api'

export function LoginScreen({ onLogin }: { onLogin: (user: AuthenticatedUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      onLogin(await signIn(email, password))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
    } finally {
      setPending(false)
    }
  }

  return <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-12">
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-neutral-900 text-lg font-semibold text-white">A</span>
        <div><p className="font-semibold tracking-tight">ACME</p><p className="text-xs text-muted-foreground">Salary management</p></div>
      </div>
      <form onSubmit={submit} className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7 flex size-10 items-center justify-center rounded-lg bg-neutral-100"><LockKeyIcon size={22} aria-hidden="true" /></div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use your account email and password to enter the workspace.</p>
        <div className="mt-7 space-y-5">
          <div><label htmlFor="email" className="mb-2 block text-sm font-medium">Email</label><Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@acme.com" nativeInput /></div>
          <div><label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} nativeInput /></div>
          {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}<ArrowRightIcon aria-hidden="true" /></Button>
        </div>
      </form>
    </div>
  </main>
}
