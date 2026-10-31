import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './v2.css'
import App from './App'
import { StoreProvider } from './store'
import { UiProvider } from './ui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </StoreProvider>
  </StrictMode>,
)
