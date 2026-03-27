import { auth } from './src/firebase.js';
import { createUserWithEmailAndPassword, inMemoryPersistence, setPersistence } from 'firebase/auth';

const email = 'flaviolimatkds1230@gmail.com';
const password = '12345678'; // Default password

console.log(`Creating user for ${email}...`);

setPersistence(auth, inMemoryPersistence)
    .then(() => {
        return createUserWithEmailAndPassword(auth, email, password);
    })
    .then((userCredential) => {
        // Signed in
        const user = userCredential.user;
        console.log('SUCCESS: User created in Firebase Auth!');
        console.log('UID:', user.uid);
        console.log('Email:', user.email);
        console.log('Temporary Password:', password);
        process.exit(0);
    })
    .catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        if (errorCode === 'auth/email-already-in-use') {
            console.log('User already exists. Skipping creation.');
            process.exit(0);
        }
        console.error('ERROR:', errorCode, errorMessage);
        process.exit(1);
    });
