// Admin site configuration. Same Firebase project as the shop = shared data.
(function () {
    var isLocal = ["localhost", "127.0.0.1"].indexOf(location.hostname) !== -1;

    window.NOIRE_ADMIN_CONFIG = {
        firebase: {
            apiKey: "AIzaSyAWWnBF3wG-4_UFtE4GNClC7TQnW1-6W88",
            authDomain: "noire-perfumes.firebaseapp.com",
            projectId: "noire-perfumes",
            storageBucket: "noire-perfumes.firebasestorage.app",
            messagingSenderId: "560768057315",
            appId: "1:560768057315:web:385c7ef26b64935aecead6",
            measurementId: "G-ZR878Q55YP"
        },

        // Only this verified account may use the admin site.
        ADMIN_EMAIL: "reenyearjunior@gmail.com",

        // Where the customer-facing Shop website lives.
        SHOP_URL: isLocal
            ? "http://localhost:5000/"
            : "https://noire-perfumes.web.app/"
    };
})();
