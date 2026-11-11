import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Beyblade } from './Beyblade.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Beyblade />
  </StrictMode>,
)
