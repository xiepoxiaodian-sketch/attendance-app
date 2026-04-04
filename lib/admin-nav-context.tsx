import React, { createContext, useContext, useState } from "react";

export type AdminPage =
  | "dashboard"
  | "employees"
  | "schedule"
  | "attendance"
  | "leave-review"
  | "punch-correction"
  | "reports"
  | "devices"
  | "settings";

interface AdminNavContextType {
  currentPage: AdminPage;
  navigate: (page: AdminPage) => void;
}

const AdminNavContext = createContext<AdminNavContextType>({
  currentPage: "dashboard",
  navigate: () => {},
});

export function AdminNavProvider({ children }: { children: React.ReactNode }) {
  const [currentPage, setCurrentPage] = useState<AdminPage>("dashboard");

  return (
    <AdminNavContext.Provider value={{ currentPage, navigate: setCurrentPage }}>
      {children}
    </AdminNavContext.Provider>
  );
}

export function useAdminNav() {
  return useContext(AdminNavContext);
}
