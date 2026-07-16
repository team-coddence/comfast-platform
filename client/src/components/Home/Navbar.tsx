import { Link } from "react-router-dom";
import { ArrowRightIcon } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function Navbar() {
  const { user } = useAuth();

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link
          to="/"
          onClick={() => scrollTo(0, 0)}
          className="flex items-center gap-2 "
        >
          <img src="/logo.svg" alt="logo" className="w-full h-8" />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-500">
          <a href="#features" className="hover:text-slate-900">
            Fonctionnalités
          </a>
          <a href="#how-it-works" className="hover:text-slate-900">
            Comment ça marche
          </a>
          <a href="#pricing" className="hover:text-slate-900">
            Tarifs
          </a>
        </div>

        {user ? (
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-full shadow-sm hover:shadow-primary-100 hover:shadow-md cursor-pointer"
          >
            Accéder au tableau de bord <ArrowRightIcon className="size-3.5" />
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-slate-600 hover:text-slate-900 hidden sm:block cursor-pointer"
            >
              Se connecter
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-full shadow-sm hover:shadow-primary-100 hover:shadow-md cursor-pointer"
            >
              Démarrer <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
