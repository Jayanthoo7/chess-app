import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import GamePage from './pages/GamePage'
import AIPage from './pages/AIPage'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/game/:id" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
      <Route path="/ai" element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
    </Routes>
  )
}
