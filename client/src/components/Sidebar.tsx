import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  UsersIcon,
  Wand2Icon,
  Building2Icon,
  BarChart3Icon,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const Sidebar = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}) => {
  const { logout, user } = useAuth();

  const location = useLocation();

  const navItems = [
    { name: "Tableau de bord", icon: LayoutDashboardIcon, path: "/dashboard" },
    { name: "Comptes", icon: UsersIcon, path: "/accounts" },
    { name: "Planificateur", icon: CalendarDaysIcon, path: "/schedule" },
    { name: "Compositeur IA", icon: Wand2Icon, path: "/ai-composer" },
  ];

  const upcomingItems = [
    {
      name: "Espaces Entreprises",
      icon: Building2Icon,
      description: "Gérer les workspaces et comptes par entreprise",
    },
    {
      name: "Statistiques",
      icon: BarChart3Icon,
      description: "Statistiques détaillées de vos publications par réseau",
    },
  ];

  return (
    <div
      className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col h-full transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="text-xl tracking-tight text-slate-800 flex items-center gap-1.5">
          <img src="/logo.svg" alt="logo" className="w-full h-7" />
        </div>
      </div>

      {/* Scrollable nav container */}
      <div className="flex-1 overflow-y-auto px-3 space-y-6">
        <div>
          {/* Nav section label */}
          <div className="px-3 py-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Menu
            </span>
          </div>

          {/* Nav links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;

              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end={item.path === "/dashboard"}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all duration-150 border ${isActive ? "bg-primary-50 text-primary-600  border-primary-100" : "text-slate-500 hover:bg-slate-50 border-transparent hover:text-slate-700"}`}
                >
                  <item.icon
                    className={`size-4.5 shrink-0 ${isActive ? "text-primary-500" : "text-slate-500"}`}
                  />
                  {item.name}
                  {isActive && (
                    <span className="ml-auto w-1.25 h-5 rounded-full bg-primary-500" />
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div>
          {/* Upcoming section label */}
          <div className="px-3 py-2 border-t border-slate-100/80 pt-4">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              À venir
            </span>
          </div>

          {/* Upcoming items */}
          <div className="space-y-1">
            {upcomingItems.map((item) => (
              <button
                key={item.name}
                title={item.description}
                onClick={() => {
                  toast.success(
                    `${item.name} : cette fonctionnalité sera bientôt disponible !`,
                    {
                      style: {
                        borderRadius: "8px",
                        background: "#0f172a",
                        color: "#fff",
                        fontSize: "14px",
                      },
                    }
                  );
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all duration-150 border border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-500 cursor-pointer text-left"
              >
                <item.icon className="size-4.5 shrink-0 text-slate-400" />
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">{item.name}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/40 uppercase tracking-wide scale-90 origin-right">
                    Bientôt
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* User footer */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
          <div className="size-8 rounded-full bg-linear-to-br from-primary-400 to-emerald-400 flex items-center justify-center text-white text-sm font-medium shrink-0">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-800 truncate">
              {user?.name || "Utilisateur"}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {user?.email || "email@exemple.com"}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="mt-1 flex items-center gap-2 px-3 py-2 w-full rounded text-sm text-slate-500 hover:bg-primary-50 hover:text-primary-500 transition-all duration-150 cursor-pointer"
        >
          <LogOutIcon className="size-4" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
