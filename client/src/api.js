import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('crm_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      const login = location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
      if (!location.pathname.endsWith('/login')) location.href = login;
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e, fallback = 'Something went wrong') => e?.response?.data?.message || e?.message || fallback;
export default api;
