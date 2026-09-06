import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.tsx";
import { WorkspaceProvider } from "./context/WorkspaceContext.tsx";
import { SubscriptionProvider } from "./context/SubscriptionContext.tsx";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            {/* Nested inside AuthProvider: the workspace fetch has to wait for
                auth to settle, or it 401s on every reload. */}
            <AuthProvider>
                <WorkspaceProvider>
                    {/* Innermost: the entitlement is per workspace, so it can
                        only be fetched once the active one is known. */}
                    <SubscriptionProvider>
                        <App />
                    </SubscriptionProvider>
                </WorkspaceProvider>
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>
);
