import axios from "axios";

const baseURL = (import.meta.env.VITE_API_URL || "https://edusaas-bi.onrender.com").replace(/\/$/, "");

const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aceda_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthLogin = error.config?.url?.includes("/api/auth/login");
    if (error.response?.status === 401 && !isAuthLogin) {
      localStorage.removeItem("aceda_token");
      localStorage.removeItem("aceda_user");
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;