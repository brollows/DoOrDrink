import { Navigate, Route, Routes } from 'react-router-dom';
import GamePage from './pages/GamePage';
import HomePage from './pages/HomePage';
import InfoPage from './pages/InfoPage';
import TestPage from './pages/TestPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/join/:code" element={<HomePage />} />
      <Route path="/game/:sessionId" element={<GamePage />} />
      <Route path="/rules" element={<InfoPage />} />
      <Route path="/install" element={<InfoPage install />} />
      {/* Hidden: not linked from the app. */}
      <Route path="/test" element={<TestPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
