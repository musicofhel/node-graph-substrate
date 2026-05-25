import { NavLink } from "react-router";
import { useUIStore } from "../../lib/store/ui-store";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: "H" },
  { to: "/projects", label: "Projects", icon: "P" },
  { to: "/streams", label: "Streams", icon: "S" },
  { to: "/daemons", label: "Daemons", icon: "D" },
  { to: "/packs", label: "Packs", icon: "K" },
];

const SETTINGS_ITEM = { to: "/settings", label: "Settings", icon: "G" };

function SidebarLink({ to, label, icon, collapsed }: { to: string; label: string; icon: string; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
          isActive
            ? "bg-neutral-800 text-white"
            : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
        }`
      }
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs font-medium">
        {icon}
      </span>
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const collapsed = !sidebarOpen;

  return (
    <nav
      className="flex h-full shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 p-2"
      style={{ width: collapsed ? 48 : 200 }}
    >
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="mb-2 flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? ">" : "<"}
      </button>
      <div className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} {...item} collapsed={collapsed} />
        ))}
      </div>
      <div className="border-t border-neutral-800 pt-2">
        <SidebarLink {...SETTINGS_ITEM} collapsed={collapsed} />
      </div>
    </nav>
  );
}
