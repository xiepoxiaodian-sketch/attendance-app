import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const EMPLOYEE_KEY = "employee_session";
const REMEMBER_CREDENTIALS_KEY = "remember_credentials";
const SAVED_CREDENTIALS_KEY = "saved_credentials";
const STAY_LOGGED_IN_KEY = "stay_logged_in";
const BIOMETRIC_ENABLED_KEY = "biometric_enabled";
const BIOMETRIC_CREDENTIALS_KEY = "biometric_credentials";

export interface EmployeeSession {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "employee";
  needsSetup: boolean;
  employeeType?: string;
  jobTitle?: string | null;
}

export interface SavedCredentials {
  username: string;
  password: string;
}

interface EmployeeAuthContextType {
  employee: EmployeeSession | null;
  isLoading: boolean;
  login: (session: EmployeeSession, stayLoggedIn?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  updateSession: (updates: Partial<EmployeeSession>) => Promise<void>;
  saveCredentials: (username: string, password: string) => Promise<void>;
  loadSavedCredentials: () => Promise<SavedCredentials | null>;
  clearSavedCredentials: () => Promise<void>;
  isBiometricEnabled: () => Promise<boolean>;
  enableBiometric: (username: string, password: string) => Promise<void>;
  disableBiometric: () => Promise<void>;
  getBiometricCredentials: () => Promise<SavedCredentials | null>;
}

const EmployeeAuthContext = createContext<EmployeeAuthContextType>({
  employee: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateSession: async () => {},
  saveCredentials: async () => {},
  loadSavedCredentials: async () => null,
  clearSavedCredentials: async () => {},
  isBiometricEnabled: async () => false,
  enableBiometric: async () => {},
  disableBiometric: async () => {},
  getBiometricCredentials: async () => null,
});

async function secureGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

async function storeSession(session: EmployeeSession) {
  await secureSet(EMPLOYEE_KEY, JSON.stringify(session));
}

async function loadSession(): Promise<EmployeeSession | null> {
  try {
    const data = await secureGet(EMPLOYEE_KEY);
    if (!data) return null;
    return JSON.parse(data) as EmployeeSession;
  } catch {
    return null;
  }
}

async function clearSession() {
  await secureDelete(EMPLOYEE_KEY);
}

export function EmployeeAuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<EmployeeSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    secureGet(STAY_LOGGED_IN_KEY).then(async (stayLoggedIn) => {
      if (stayLoggedIn === "true") {
        const session = await loadSession();
        setEmployee(session);
      }
      setIsLoading(false);
    });
  }, []);

  const login = async (session: EmployeeSession, stayLoggedIn = false) => {
    await secureSet(STAY_LOGGED_IN_KEY, stayLoggedIn ? "true" : "false");
    await storeSession(session);
    setEmployee(session);
  };

  const logout = async () => {
    await clearSession();
    setEmployee(null);
  };

  const updateSession = async (updates: Partial<EmployeeSession>) => {
    if (!employee) return;
    const updated = { ...employee, ...updates };
    await storeSession(updated);
    setEmployee(updated);
  };

  const saveCredentials = async (username: string, password: string) => {
    await secureSet(REMEMBER_CREDENTIALS_KEY, "true");
    await secureSet(SAVED_CREDENTIALS_KEY, JSON.stringify({ username, password }));
  };

  const loadSavedCredentials = async (): Promise<SavedCredentials | null> => {
    try {
      const remember = await secureGet(REMEMBER_CREDENTIALS_KEY);
      if (remember !== "true") return null;
      const data = await secureGet(SAVED_CREDENTIALS_KEY);
      if (!data) return null;
      return JSON.parse(data) as SavedCredentials;
    } catch {
      return null;
    }
  };

  const clearSavedCredentials = async () => {
    await secureDelete(REMEMBER_CREDENTIALS_KEY);
    await secureDelete(SAVED_CREDENTIALS_KEY);
  };

  // Biometric methods
  const isBiometricEnabled = async (): Promise<boolean> => {
    const val = await secureGet(BIOMETRIC_ENABLED_KEY);
    return val === "true";
  };

  const enableBiometric = async (username: string, password: string): Promise<void> => {
    await secureSet(BIOMETRIC_ENABLED_KEY, "true");
    await secureSet(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify({ username, password }));
  };

  const disableBiometric = async (): Promise<void> => {
    await secureDelete(BIOMETRIC_ENABLED_KEY);
    await secureDelete(BIOMETRIC_CREDENTIALS_KEY);
  };

  const getBiometricCredentials = async (): Promise<SavedCredentials | null> => {
    try {
      const enabled = await secureGet(BIOMETRIC_ENABLED_KEY);
      if (enabled !== "true") return null;
      const data = await secureGet(BIOMETRIC_CREDENTIALS_KEY);
      if (!data) return null;
      return JSON.parse(data) as SavedCredentials;
    } catch {
      return null;
    }
  };

  return (
    <EmployeeAuthContext.Provider value={{
      employee,
      isLoading,
      login,
      logout,
      updateSession,
      saveCredentials,
      loadSavedCredentials,
      clearSavedCredentials,
      isBiometricEnabled,
      enableBiometric,
      disableBiometric,
      getBiometricCredentials,
    }}>
      {children}
    </EmployeeAuthContext.Provider>
  );
}

export function useEmployeeAuth() {
  return useContext(EmployeeAuthContext);
}
