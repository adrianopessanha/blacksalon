import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, setDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
// ... (omitting lines 5-17 for clarity in thought, but I'll provide full block)
export { signInWithEmailAndPassword, onAuthStateChanged, signOut, collection, addDoc, deleteDoc, updateDoc, setDoc, doc, serverTimestamp, query, where, getDocs, orderBy, limit, onSnapshot };
