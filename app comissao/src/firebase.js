import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBtINyPi1K6Fo3r1XrgdzK4j7wpiJ77i1c",
    authDomain: "novo-gestao-comissao.firebaseapp.com",
    projectId: "novo-gestao-comissao",
    storageBucket: "novo-gestao-comissao.firebasestorage.app",
    messagingSenderId: "709910243784",
    appId: "1:709910243784:web:8cf5ea27419391e85cb8fd"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export { signInWithEmailAndPassword, onAuthStateChanged, signOut, collection, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot };
