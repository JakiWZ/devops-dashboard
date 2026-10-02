import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type Credentials } from '../api/endpoints';
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/http';
import type { Session } from '../api/schemas';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const startSession = useCallback((session: Session) => {
    setAccessToken(session.accessToken);
    setState({ status: 'authenticated', user: session.user });
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setState({ status: 'anonymous', user: null });
  }, [queryClient]);

  // Al caricamento della pagina l'access token in memoria non c'è più: il cookie di refresh,
  // se ancora valido, ripristina la sessione senza chiedere di nuovo le credenziali.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (active) startSession(session);
      })
      .catch(() => {
        if (active) setState({ status: 'anonymous', user: null });
      });
    return () => {
      active = false;
    };
  }, [startSession]);

  useEffect(() => {
    setSessionExpiredHandler(endSession);
    return () => setSessionExpiredHandler(null);
  }, [endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (credentials: Credentials) => startSession(await authApi.login(credentials)),
      register: async (credentials: Credentials) =>
        startSession(await authApi.register(credentials)),
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          endSession();
        }
      },
    }),
    [state, startSession, endSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
