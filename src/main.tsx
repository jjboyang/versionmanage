import React from 'react'
import ReactDOM from 'react-dom/client'
import { initTheme } from './theme'
import App from './App'
import './themes.css'
import './App.css'

initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
