import axios from 'axios';
import { getAuth } from 'firebase/auth';
import app from '../firebase';

const api = axios.create({
  baseURL: 'https://sinergiatasks-production.up.railway.app/api',
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  const currentUser = getAuth(app).currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
export default api;
