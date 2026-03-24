import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Lobby from './components/Lobby.jsx'
import WaitingRoom from './components/WaitingRoom.jsx'
import OnlineGame from './components/OnlineGame.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/play" element={<App />} />
        <Route path="/room/:code/wait" element={<WaitingRoom />} />
        <Route path="/room/:code/play" element={<OnlineGame />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
