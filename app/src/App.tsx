import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './screens/Login'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Profile } from './screens/Profile'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/home" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
