import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ACTIVE_WORKSPACE_KEY, AUTH_EXPIRED_EVENT, TOKEN_KEY } from "../api/axios";

interface User {
    _id: string;
    name: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (userData: User, token: string)=> void;
    logout: () => void;
     isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children})=>{

    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(()=>{
        const storedUser = localStorage.getItem("user");
        const storedToken = localStorage.getItem(TOKEN_KEY);

        if(storedUser && storedToken){
            setUser(JSON.parse(storedUser))
            setToken(storedToken)
        }

        setIsLoading(false)
    },[])

    const login = (userData: User, newToken: string)=>{
        setUser(userData)
        setToken(newToken)
        localStorage.setItem("user", JSON.stringify(userData))
        localStorage.setItem(TOKEN_KEY, newToken)
    }

    const logout = useCallback(()=>{
        setUser(null)
        setToken(null)
        localStorage.removeItem("user")
        localStorage.removeItem(TOKEN_KEY)
        // Must be cleared too, or the next person to sign in on this browser
        // inherits the previous user's selection and gets a 403 on first load.
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
    }, [])

    // The API client raises this on any 401. Previously a stale token left the
    // app rendering an authenticated shell with every request failing.
    useEffect(()=>{
        const handler = () => logout();
        window.addEventListener(AUTH_EXPIRED_EVENT, handler);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
    },[logout])

    return <AuthContext.Provider value={{user, token, isLoading, login, logout, isAuthenticated: !!token}}>
        {children}
    </AuthContext.Provider>

}

export const useAuth = ()=>{
    const context = useContext(AuthContext);
    if(context === undefined){
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
