import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { WorkspaceProvider } from "./context/WorkspaceContext.tsx";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            {/* Nested inside AuthProvider: the workspace fetch has to wait for
                auth to settle, or it 401s on every reload. */}
            <AuthProvider>
                <WorkspaceProvider>
                    <App />
                </WorkspaceProvider>
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>
);
