import React, { createContext, useContext, useState } from "react";
import { Platform } from "react-native";

export type AdminPage =
  | "dashboard"
  | "employees"
  | "schedule"
  | "attendance"
  | "leave-review"
  | "punch-correction"
  | "reports"
  | "devices"
  | "work-shifts"
  | "settings";

const STORAGE_KEY = "admin_last_page";
const VALID_PAGES: AdminPage[] = [
  "dashboard", "employees", "schedule", "attendance",
  "leave-review", "punch-correction", "reports", "devices", "work-shifts", "settings",
];

function getInitialPage(): AdminPage {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_PAGES.includes(saved as AdminPage)) {
        return saved as AdminPage;
      }
    } catch {}
  }
  return "dashboard";
}

interface AdminNavContextType {
  currentPage: AdminPage;
  navigate: (page: AdminPage) => void;
}
const AdminNavContext = createContext<AdminNavContextType>({
  currentPage: "dashboard",
  navigate: () => {},
});
export function AdminNavProvider({ children }: { children: React.ReactNode }) {
  const [currentPage, setCurrentPage] = useState<AdminPage>(getInitialPage);

  const navigate = (page: AdminPage) => {
    setCurrentPage(page);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try { localStorage.setItem(STORAGE_KEY, page); } catch {}
    }
  };

  return (
    <AdminNavContext.Provider value={{ currentPage, navigate }}>
      {children}
    </AdminNavContext.Provider>
  );
}
export function useAdminNav() {
  return useContext(AdminNavContext);
}
