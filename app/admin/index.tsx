import { AdminNavProvider, useAdminNav } from "@/lib/admin-nav-context";
import AdminDashboard from "@/components/admin/dashboard-page";
import AdminEmployeesScreen from "@/components/admin/employees-page";
import AdminScheduleScreen from "@/components/admin/schedule-page";
import AdminAttendanceScreen from "@/components/admin/attendance-page";
import AdminLeaveReviewScreen from "@/components/admin/leave-review-page";
import AdminPunchCorrectionScreen from "@/components/admin/punch-correction-page";
import AdminReportsScreen from "@/components/admin/reports-page";
import AdminDevicesScreen from "@/components/admin/devices-page";
import AdminWorkShiftsScreen from "@/components/admin/work-shifts-page";
import AdminSettingsScreen from "@/components/admin/settings-page";

function AdminContent() {
  const { currentPage } = useAdminNav();

  switch (currentPage) {
    case "employees":
      return <AdminEmployeesScreen />;
    case "schedule":
      return <AdminScheduleScreen />;
    case "attendance":
      return <AdminAttendanceScreen />;
    case "leave-review":
      return <AdminLeaveReviewScreen />;
    case "punch-correction":
      return <AdminPunchCorrectionScreen />;
    case "reports":
      return <AdminReportsScreen />;
    case "devices":
      return <AdminDevicesScreen />;
    case "work-shifts":
      return <AdminWorkShiftsScreen />;
    case "settings":
      return <AdminSettingsScreen />;
    case "dashboard":
    default:
      return <AdminDashboard />;
  }
}

export default function AdminIndex() {
  return (
    <AdminNavProvider>
      <AdminContent />
    </AdminNavProvider>
  );
}
