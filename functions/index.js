
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();

const auth = getAuth();
const db = getFirestore();

const ADMIN_EMAIL = "reenyearjunior@gmail.com";

function requireAdmin(request) {
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Please log in first."
        );
    }

    if (request.auth.token.admin !== true) {
        throw new HttpsError(
            "permission-denied",
            "Only an authorized administrator can do this."
        );
    }
}

// One-time bootstrap: only the verified owner of the configured
// admin email can receive the initial admin custom claim.
exports.claimInitialAdmin = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Please log in first.");
    }

    const user = await auth.getUser(request.auth.uid);

    if (
        !user.email ||
        user.email.toLowerCase() !== ADMIN_EMAIL ||
        user.emailVerified !== true
    ) {
        throw new HttpsError(
            "permission-denied",
            "Sign in with the verified administrator email."
        );
    }

    await auth.setCustomUserClaims(user.uid, {
        ...(user.customClaims || {}),
        admin: true
    });

    return { success: true };
});

// List registered Authentication users and their block status.
exports.adminListUsers = onCall(async (request) => {
    requireAdmin(request);

    const users = [];
    let pageToken;

    do {
        const result = await auth.listUsers(1000, pageToken);

        for (const user of result.users) {
            const blockedDoc = await db
                .collection("blockedUsers")
                .doc(user.uid)
                .get();

            users.push({
                uid: user.uid,
                name: user.displayName || "",
                email: user.email || "",
                blocked: user.disabled ||
                    blockedDoc.data()?.blocked === true
            });
        }

        pageToken = result.pageToken;
    } while (pageToken);

    return { users };
});

// Block/unblock sign-in and record the restriction in Firestore.
exports.adminSetUserBlocked = onCall(async (request) => {
    requireAdmin(request);

    const { uid, blocked } = request.data || {};

    if (typeof uid !== "string" || typeof blocked !== "boolean") {
        throw new HttpsError("invalid-argument", "Invalid user or status.");
    }

    if (uid === request.auth.uid) {
        throw new HttpsError(
            "failed-precondition",
            "You cannot block your own admin account."
        );
    }

    const target = await auth.getUser(uid);

    if (target.email?.toLowerCase() === ADMIN_EMAIL) {
        throw new HttpsError(
            "permission-denied",
            "The main admin account cannot be blocked here."
        );
    }

    await auth.updateUser(uid, { disabled: blocked });

    await db.collection("blockedUsers").doc(uid).set({
        blocked,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
    });

    return { success: true };
});

// Permanently delete a customer account.
exports.adminDeleteUser = onCall(async (request) => {
    requireAdmin(request);

    const { uid } = request.data || {};

    if (typeof uid !== "string" || !uid) {
        throw new HttpsError("invalid-argument", "User ID is required.");
    }

    if (uid === request.auth.uid) {
        throw new HttpsError(
            "failed-precondition",
            "You cannot delete your own admin account."
        );
    }

    const target = await auth.getUser(uid);

    if (target.email?.toLowerCase() === ADMIN_EMAIL) {
        throw new HttpsError(
            "permission-denied",
            "The main admin account cannot be deleted here."
        );
    }

    await auth.deleteUser(uid);

    // Keep a restriction record so a deleted account's old token
    // cannot pass the Firestore blocked-user check.
    await db.collection("blockedUsers").doc(uid).set({
        blocked: true,
        deleted: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
    });

    return { success: true };
});

// List recent orders.
exports.adminListOrders = onCall(async (request) => {
    requireAdmin(request);

    const snapshot = await db.collection("orders")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

    const orders = snapshot.docs.map(doc => {
        const data = doc.data();

        return {
            id: doc.id,
            name: data.name || "",
            email: data.email || "",
            total: Number(data.total || 0),
            status: data.status || "Placed"
        };
    });

    return { orders };
});

// Update the status of an order.
exports.adminUpdateOrderStatus = onCall(async (request) => {
    requireAdmin(request);

    const { orderId, status } = request.data || {};

    const allowedStatuses = [
        "Placed",
        "Processing",
        "To Ship",
        "To Receive",
        "Completed"
    ];

    if (
        typeof orderId !== "string" ||
        !allowedStatuses.includes(status)
    ) {
        throw new HttpsError("invalid-argument", "Invalid order or status.");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const order = await orderRef.get();

    if (!order.exists) {
        throw new HttpsError("not-found", "Order not found.");
    }

    await orderRef.update({
        status,
        updatedAt: FieldValue.serverTimestamp()
    });

    return { success: true };
});
