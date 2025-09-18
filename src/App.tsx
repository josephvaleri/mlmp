import { Routes, Route } from 'react-router-dom'
import MLMPPage from './pages/mlmp/MLMPPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import './App.css'

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<MLMPPage />} />
        <Route path="/mlmp" element={<MLMPPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </div>
  )
}

export default App
