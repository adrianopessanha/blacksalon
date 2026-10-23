import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, setDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = getFunctions(app, 'southamerica-east1');

// Chama uma função do servidor (onCall) e devolve só os dados
export const chamarFuncao = (nome, dados) => httpsCallable(functions, nome)(dados).then(r => r.data);

export { signInWithEmailAndPassword, onAuthStateChanged, signOut, collection, addDoc, deleteDoc, updateDoc, setDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot };
