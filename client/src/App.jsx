import { useEffect, useState } from 'react';
import { api } from './api';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import Bubbles from './components/Bubbles';
import './styles.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) return null;

  return (
    <>
      <Bubbles />
      {user ? <Dashboard user={user} onLoggedOut={() => setUser(null)} /> : <LoginPage onLoggedIn={setUser} />}
    </>
  );
}
