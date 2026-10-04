import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type HealthState = 'checking' | 'healthy' | 'database-error' | 'api-error'

type HealthResponse = {
  status: string
  database: string
}

async function getHealth(signal?: AbortSignal): Promise<HealthState> {
  try {
    const response = await fetch('/api/health', { signal })
    if (!response.ok && response.status !== 503) return 'api-error'

    const result = (await response.json()) as HealthResponse
    if (response.ok && result.status === 'ok' && result.database === 'ok') return 'healthy'
    if (response.status === 503 && result.database === 'unavailable') return 'database-error'
    return 'api-error'
  } catch (error) {
    if (!signal?.aborted) console.error('Health check failed', error)
    return 'api-error'
  }
}

function App() {
  const [health, setHealth] = useState<HealthState>('checking')

  useEffect(() => {
    const controller = new AbortController()
    void getHealth(controller.signal).then((result) => {
      if (!controller.signal.aborted) setHealth(result)
    })
    return () => controller.abort()
  }, [])

  function checkAgain() {
    setHealth('checking')
    void getHealth().then(setHealth)
  }

  const apiStatus = health === 'checking' ? 'Checking…' : health === 'api-error' ? 'Unavailable' : 'Connected'
  const databaseStatus = {
    checking: 'Checking…',
    healthy: 'Connected',
    'database-error': 'Unavailable',
    'api-error': 'Not checked',
  }[health]

  return (
    <main className="min-h-svh bg-muted/30 px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-xl space-y-8">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">ACME · Salary management</p>
          <h1 className="text-3xl font-semibold tracking-tight">System status</h1>
          <p className="text-muted-foreground">
            Check the connection between the web app, FastAPI, and SQLite.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>Health check</CardTitle>
                <CardDescription>Live response from /api/health</CardDescription>
              </div>
              <Badge
                variant={health === 'healthy' ? 'secondary' : health === 'checking' ? 'outline' : 'destructive'}
              >
                {health === 'checking' ? 'Checking' : health === 'healthy' ? 'Connected' : 'Needs attention'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div aria-live="polite" className="divide-y rounded-lg border px-4">
              <div className="flex items-center justify-between gap-4 py-3">
                <span>FastAPI</span>
                <span className="text-sm text-muted-foreground">{apiStatus}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span>SQLite</span>
                <span className="text-sm text-muted-foreground">{databaseStatus}</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={health === 'checking'}
              onClick={checkAgain}
            >
              Check again
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default App
