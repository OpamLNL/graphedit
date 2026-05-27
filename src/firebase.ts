import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
//import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyBRUHazub9tSM0sdexV5y6VkdWtVr3d4sE",
    authDomain: "diploma-web.firebaseapp.com",
    projectId: "diploma-web",
    storageBucket: "diploma-web.firebasestorage.app",
    messagingSenderId: "425439848926",
    appId: "1:425439848926:web:1d5529800b3b98f023d54f",
    measurementId: "G-Z6PH7ZVS8B"
};

const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
