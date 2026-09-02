/*
 * App.tsx
 * Main entry point for the React frontend. Handles routing and session-based authentication.
 */

import React from 'react'
// import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import Field4DLoadingLogo from './components/Field4DLoadingLogo'
import { auth } from './lib/firebase'
import './index.css'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Session expiration time in milliseconds (default: 24 hours)
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const MINIMUM_BOOT_SCREEN_MS = 850;
const BOOT_EXIT_FADE_MS = 250;
const BOOT_MESSAGE_ROTATION_MS = 3800;
const BOOT_MESSAGES = [
  'Turning plant signals into insight',
  'Connecting plants, climate, and data',
  'Listening to what the plants are telling us',
  'From field signals to scientific insight',
  'Where plants, sensors, and data come together',
  'Making the invisible plant environment visible',
] as const;

type BootPhase = 'loading' | 'exiting' | 'complete';

const wait = (durationMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, durationMs);
});

const hasValidSession = () => {
  const userDataRaw = localStorage.getItem('userData');
  if (!userDataRaw) {
    return false;
  }

  try {
    const userData = JSON.parse(userDataRaw);
    if (userData.timestamp && Date.now() - userData.timestamp < SESSION_DURATION) {
      return true;
    }
  } catch {
    // Invalid session data is cleared below.
  }

  localStorage.removeItem('userData');
  return false;
};

/**
 * PrivateRoute
 * Protects routes that require authentication.
 * - Checks for userData in localStorage and session expiration.
 * - Redirects to login if not authenticated or session expired.
 * @param children - ReactNode(s) to render if authenticated
 * @returns children or <Navigate /> to login
 */
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  return hasValidSession() ? <>{children}</> : <Navigate to="/" />;
};

const RootRoute = () => {
  return hasValidSession() ? <Navigate to="/dashboard" replace /> : <Auth />;
};

/**
 * AppWrapper
 * Handles global effects (e.g., login background) and sets up routes.
 * @returns JSX.Element
 */
function AppWrapper() {
  const location = useLocation();
  const [bootPhase, setBootPhase] = React.useState<BootPhase>('loading');
  const [bootMessageIndex, setBootMessageIndex] = React.useState(
    () => Math.floor(Math.random() * BOOT_MESSAGES.length)
  );

  React.useEffect(() => {
    let active = true;
    const bootStartedAt = performance.now();

    const resolveInitialAuthState = async () => {
      try {
        await auth.authStateReady();
      } catch {
        // Preserve the existing local-session routing fallback if Firebase readiness fails.
      }

      // Playwright can inject a delay into its isolated page to exercise genuine-wait UX.
      // This hook is ignored by production builds and does not alter Firebase behavior.
      const testDelay = import.meta.env.DEV
        ? Number((window as Window & { __FIELD4D_AUTH_TEST_DELAY_MS__?: number })
          .__FIELD4D_AUTH_TEST_DELAY_MS__ || 0)
        : 0;
      if (Number.isFinite(testDelay) && testDelay > 0) {
        await wait(testDelay);
      }

      const minimumTimeRemaining = Math.max(
        0,
        MINIMUM_BOOT_SCREEN_MS - (performance.now() - bootStartedAt)
      );
      if (minimumTimeRemaining > 0) await wait(minimumTimeRemaining);
      if (!active) return;

      setBootPhase('exiting');
      await wait(BOOT_EXIT_FADE_MS);
      if (active) setBootPhase('complete');
    };

    void resolveInitialAuthState();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (bootPhase !== 'loading') return undefined;
    const rotationTimer = window.setInterval(() => {
      setBootMessageIndex((currentIndex) => (currentIndex + 1) % BOOT_MESSAGES.length);
    }, BOOT_MESSAGE_ROTATION_MS);
    return () => window.clearInterval(rotationTimer);
  }, [bootPhase]);

  React.useEffect(() => {
    if (bootPhase !== 'complete') {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundColor = '#f4f7f2';
      document.body.style.minHeight = '100vh';
    } else if (location.pathname === '/') {
      document.body.style.backgroundImage = "url('./background_Login.webp')";
      document.body.style.backgroundColor = '#f4f7f2';
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.minHeight = '100vh';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundColor = '';
      document.body.style.minHeight = '';
    }
  }, [bootPhase, location.pathname]);

  if (bootPhase !== 'complete') {
    return (
      <main
        className={`field4d-app-boot${bootPhase === 'exiting' ? ' field4d-app-boot--exiting' : ''}`}
        data-testid="app-boot-loader"
        data-boot-phase={bootPhase}
      >
        <Field4DLoadingLogo
          className="field4d-loading-logo--app-boot"
          label={BOOT_MESSAGES[bootMessageIndex]}
        />
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

/**
 * App
 * Top-level component. Wraps the app in a Router.
 * @returns JSX.Element
 */
function App() {
  return (
    <>
      <ToastContainer />
      <Router>
        <AppWrapper />
      </Router>
    </>
  )
}

export default App
