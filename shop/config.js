// Shop site configuration. Shared Firebase project = shared data with the Admin site.
(function () {
    var isLocal = ["localhost", "127.0.0.1"].indexOf(location.hostname) !== -1;

    window.NOIRE_CONFIG = {
        firebase: {
            apiKey: "AIzaSyAWWnBF3wG-4_UFtE4GNClC7TQnW1-6W88",
            authDomain: "noire-perfumes.firebaseapp.com",
            projectId: "noire-perfumes",
            storageBucket: "noire-perfumes.firebasestorage.app",
            messagingSenderId: "560768057315",
            appId: "1:560768057315:web:385c7ef26b64935aecead6",
            measurementId: "G-ZR878Q55YP"
        },

        // Only this account sees the "Admin Panel" link in the shop menu.
        ADMIN_EMAIL: "reenyearjunior@gmail.com",

        // Where the separate Admin website lives.
        ADMIN_URL: isLocal
            ? "http://localhost:5001/"
            : "https://noire-perfumes-admin.web.app/"
    };
})();
