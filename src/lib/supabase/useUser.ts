"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserClient } from "./client";

export interface UserState {
  user: User | null | undefined;
  /** GitHub OAuth access token — available when signed in with GitHub */
  providerToken: string | null;
  authLoading: boolean;
}

export function useUser(): UserState {
  const [user, setUser] = useState<User | null | undefined>(void 0);
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setProviderToken(session?.provider_token ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setProviderToken(session?.provider_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, providerToken, authLoading };
}
