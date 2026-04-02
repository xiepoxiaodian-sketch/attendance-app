import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const EMPLOYEE_KEY = "employee_session";

export interface EmployeeSession {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "employee";
  needsSetup: boolean;
  employeeType?: string;
  jobTitle?: string | null;
}

interface EmployeeAuthContextType {
  employee: EmployeeSession | null;
  isLoading: boolean;
  login: (session: EmployeeSession) => Promise<void>;
  logout: () => Promise<void>;
  updateSession: (updates: Partial<EmployeeSession>) => Promise<void>;
}

const EmployeeAuthContext = createContext<EmployeeAuthContextType>({
  employee: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateSession: async () => {},
});

async function storeSession(session: EmployeeSession) {
  const data = JSON.stringify(session);
  if (Platform.OS === "web") {
    localStorage.setItem(EMPLOYEE_KEY, data);
  } else {
    await SecureStore.setItemAsync(EMPLOYEE_KEY, data);
  }
}

async function loadSession(): Promise<EmployeeSession | null> {
  try {
    let data: string | null = null;
    if (Platform.OS === "web") {
      data = localStorage.getItem(EMPLOYEE_KEY);
    } else {
      data = await SecureStore.getItemAsync(EMPLOYEE_KEY);
    }
    if (!data) return null;
    return JSON.parse(data) as EmployeeSession;
  } catch {
    return null;
  }
}

async function clearSession() {
  if (Platform.OS === "web") {
    localStorage.removeItem(EMPLOYEE_KEY);
  } else {
    await SecureStore.deleteItemAsync(EMPLOYEE_KEY);
  }
}

export function EmployeeAuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<EmployeeSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession().then((session) => {
      setEmployee(session);
      setIsLoading(false);
    });
  }, []);

  const login = async (session: EmployeeSession) => {
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

  return (
    <EmployeeAuthContext.Provider value={{ employee, isLoading, login, logout, updateSession }}>
      {children}
    </EmployeeAuthContext.Provider>
  );
}

export function useEmployeeAuth() {
  return useContext(EmployeeAuthContext);
}
