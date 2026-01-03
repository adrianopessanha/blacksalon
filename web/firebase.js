import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'
import { getFirestore, serverTimestamp, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, runTransaction, writeBatch, collectionGroup } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'

// --- CONFIGURAÇÃO ATUALIZADA PARA O NOVO PROJETO ---
const firebaseConfig = {
  apiKey: "AIzaSyBtINyPi1K6Fo3r1XrgdzK4j7wpiJ77i1c",
  authDomain: "novo-gestao-comissao.firebaseapp.com",
  projectId: "novo-gestao-comissao",
  storageBucket: "novo-gestao-comissao.firebasestorage.app",
  messagingSenderId: "709910243784",
  appId: "1:709910243784:web:8cf5ea27419391e85cb8fd"
};
// ----------------------------------------------------

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, serverTimestamp, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, runTransaction, writeBatch, collectionGroup }

export async function getRole(u) {
  try { const idt = await u.getIdTokenResult(true); return idt.claims.role || 'barber' } catch { return 'barber' }
}
