import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
})

export const TOKEN_KEY = "token";
export const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";

// Headers are attached per request rather than by mutating api.defaults, so
// they always reflect the current values. With defaults, a workspace switch
// that lands while a request is being constructed would send the old id.
//
// localStorage is the source of truth for both — that avoids an import cycle
// between this module and the contexts, which both already persist here.
api.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const workspaceId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);

    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (workspaceId) config.headers["X-Workspace-Id"] = workspaceId;

    return config;
});

// Events the providers listen for. A CustomEvent bridge keeps this module free
// of context imports (and of the import cycle that would come with them).
export const AUTH_EXPIRED_EVENT = "auth:expired";
export const WORKSPACE_INVALID_EVENT = "workspace:invalid";

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const code = error?.response?.data?.code;

        // A stale or revoked token. AuthProvider signs the user out.
        if (status === 401) {
            window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
        }

        // Removed from the workspace, or it was deleted in another tab.
        // WorkspaceProvider drops the selection and lands on another one.
        if (
            (status === 403 && code === "WORKSPACE_FORBIDDEN") ||
            (status === 404 && code === "WORKSPACE_NOT_FOUND")
        ) {
            window.dispatchEvent(new Event(WORKSPACE_INVALID_EVENT));
        }

        return Promise.reject(error);
    }
);

export default api;
