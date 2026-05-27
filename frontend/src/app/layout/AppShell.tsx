import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "../../features/search/CommandPalette";
import { ToastContainer } from "../../components/ui/Toast";

export default function AppShell() {
  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-200">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <ToastContainer />
    </div>
  );
}
