/* Zockplan – Einstellungen.
   Die Firebase-Werte sind keine Geheimnisse: Sie stehen bei jeder Web-App öffentlich im Code.
   Geschützt werden eure Daten durch die Sicherheitsregeln in firestore.rules. */
export const firebaseConfig = {
  apiKey: 'AIzaSyAMAzZwRJwIVaZr7a-PWqIWWhosra7i7EQ',
  authDomain: 'zockplan.firebaseapp.com',
  projectId: 'zockplan',
  storageBucket: 'zockplan.firebasestorage.app',
  messagingSenderId: '507095748043',
  appId: '1:507095748043:web:ba570dcbacfacdeca93a4e',
};

/* Nur diese Google-Konten kommen in die App (muss zu firestore.rules passen). */
export const ALLOWED_EMAILS = [
  'luca.treichel@googlemail.com',
  'luca.treichel@gmail.com',
];
