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

export default api;
