import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyAvt8EqyDPEitkOeXqMk7pCtDPtfbcXlqI",
  authDomain: "sinergia-interactiva.firebaseapp.com",
  projectId: "sinergia-interactiva",
  storageBucket: "sinergia-interactiva.firebasestorage.app",
  messagingSenderId: "822648627559",
  appId: "1:822648627559:web:6bb960f25c69d0ba884fc2"
};

const app = initializeApp(firebaseConfig);

export default app;