import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import GamePage from './pages/GamePage'
import AIPage from './pages/AIPage'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Friends from './pages/Friends'
import ProtectedRoute from './components/ProtectedRoute'
import InviteOverlay from './components/InviteOverlay'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/game/:id" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
        <Route path="/ai" element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
        <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
      </Routes>
      <InviteOverlay />
    </>
  )
}
