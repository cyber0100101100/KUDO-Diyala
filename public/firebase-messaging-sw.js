importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyACyqCqzx7IPY108oc8GryxWd5_ouhF6MQ",
  authDomain: "gen-lang-client-0351911300.firebaseapp.com",
  projectId: "gen-lang-client-0351911300",
  storageBucket: "gen-lang-client-0351911300.firebasestorage.app",
  messagingSenderId: "448327896209",
  appId: "1:448327896209:web:d020a7f75a2c1a62ab8330"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
