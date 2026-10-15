import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { logError, installErrorLog } from './diagnostics/errorLog'
import { db } from './db/schema'
import { initInstall } from './pwa/install'
import { registerServiceWorker } from './pwa/register'
import { App } from './ui/App'
import { StorageProblem } from './ui/StorageProblem'
import './ui/styles.css'

installErrorLog()

// Both must start before the first render: the browser fires the install prompt early.
initInstall()
registerServiceWorker()

const root = createRoot(document.getElementById('root')!)

// Open the database before showing anything, so a browser that blocks storage gets an explanation, not a blank page.
db.open().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  (error: unknown) => {
    logError('startup', error)
    root.render(<StorageProblem />)
  },
)
