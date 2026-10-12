import { Navigate, Route, Routes } from 'react-router-dom';
import GamePage from './pages/GamePage';
import HomePage from './pages/HomePage';
import InfoPage from './pages/InfoPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/join/:code" element={<HomePage />} />
      <Route path="/game/:sessionId" element={<GamePage />} />
      <Route path="/rules" element={<InfoPage />} />
      <Route path="/install" element={<InfoPage install />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
