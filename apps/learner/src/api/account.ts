import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type UtenteVista,
  UtenteVistaSchema,
  type PatchMeRichiesta,
  PatchMeRichiestaSchema,
} from '@formazione/contracts';
import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';

const TOKEN_KEY = '@civis_auth_token';
const DEVICE_ID_KEY = '@civis_device_id';

export const supabaseUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://demo.supabase.co'
).replace(/\/$/, '');

export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'demo-anon-key';

let cachedToken: string | null = null;
let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
    const fresh = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
    cachedDeviceId = fresh;
    return fresh;
  } catch {
    return 'dev_fallback_ephemeral';
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    cachedToken = token;
    return token;
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors in test / ephemeral environments
  }
}

export async function buildAuthHeaders(customToken?: string | null): Promise<Record<string, string>> {
  const token = customToken !== undefined ? customToken : await getAuthToken();
  const deviceId = await getDeviceId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Device-Id': deviceId,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function getMe(signal?: AbortSignal): Promise<UtenteVista> {
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/me`, {
    method: 'GET',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile recuperare i dati dell’account.'));
  }
  return UtenteVistaSchema.parse(data);
}

export async function patchMe(
  richiesta: PatchMeRichiesta,
  signal?: AbortSignal,
): Promise<{ nome_visualizzato: string }> {
  const parsed = PatchMeRichiestaSchema.parse(richiesta);
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/me`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed),
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile aggiornare il profilo.'));
  }
  return data;
}

export interface AuthSessionResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: {
    id: string;
    email: string;
    user_metadata?: {
      nome_visualizzato?: string;
      referral_code?: string;
    };
  };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  options?: { nome_visualizzato?: string; referral_code?: string },
): Promise<{ user: any; session: AuthSessionResponse | null }> {
  const r = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      email,
      password,
      data: {
        nome_visualizzato: options?.nome_visualizzato || undefined,
        referral_code: options?.referral_code || undefined,
      },
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Registrazione fallita.'));
  }
  if (data.access_token) {
    await setAuthToken(data.access_token);
  }
  return data;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthSessionResponse> {
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Credenziali non valide o errore di accesso.'));
  }
  if (data.access_token) {
    await setAuthToken(data.access_token);
  }
  return data;
}

export async function signOut(): Promise<void> {
  await setAuthToken(null);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const r = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ email }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile inviare il link di ripristino.'));
  }
}
