// Public web configuration; no private keys or service-account credentials.
window.APP_CONFIG = {
 lineApiBase: 'https://split-expenses-line.8s8r24zvt2.workers.dev/', // Fill only after deploying the user-owned LINE backend.
 liffId: '2012396328-SmwrIxyy',
 firebase: {
  apiKey: 'AIzaSyDa2nz2u4AU0Ij0vXQ8-7qKnDrA8FWy8FU',
  authDomain: 'split-expenses-4aa7f.firebaseapp.com',
  projectId: 'split-expenses-4aa7f',
  messagingSenderId: '338265918038',
  appId: '1:338265918038:web:cff77ed84eef6fb6f949f7'
 }
};

// Legacy access is retained only for explicit Google-owned book migration.
if(new URLSearchParams(location.search).get("legacy")==="1")window.APP_CONFIG.lineApiBase="";
