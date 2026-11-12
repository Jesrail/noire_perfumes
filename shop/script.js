
const firebaseConfig = NOIRE_CONFIG.firebase;

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
let currentUser = null;


const ADMIN_EMAIL = NOIRE_CONFIG.ADMIN_EMAIL.toLowerCase();


function updateAccountMenu(user) {
    const accountItem = document.getElementById("accountNavItem");
    if (!accountItem) return;

    accountItem.replaceChildren();

    // Show Profile for everyone.
    const profileLink = document.createElement("a");
    profileLink.href = user ? "profile.html" : "login.html";
    profileLink.textContent = "Profile";
    accountItem.appendChild(profileLink);

    // Show a link to the separate Admin website, only for the admin email.
    if (
        user &&
        user.email &&
        user.email.toLowerCase() === ADMIN_EMAIL
    ) {
        const adminLink = document.createElement("a");
        adminLink.href = NOIRE_CONFIG.ADMIN_URL;
        adminLink.textContent = "Admin Panel";
        adminLink.style.marginLeft = "12px";
        accountItem.appendChild(adminLink);
    }
}


// AUTHENTICATION

function initAuth() {
    return new Promise(resolve => {
        let firstCheck = true;

        firebase.auth().onAuthStateChanged(
            async user => {
                currentUser = user;
                const currentPage = window.location.pathname
    .split("/")
    .pop()
    .toLowerCase();

const protectedPages = [
    "home.html",
    "product.html",
    "cart.html",
    "contact.html",
    "about.html",
    "profile.html"
];

if (!user && protectedPages.includes(currentPage)) {
    window.location.replace("login.html");
    return;
}
                updateAccountMenu(user);

                console.log(
                    user ? "User connected:" : "No user signed in",
                    user ? user.uid : ""
                );

                try {
                    await updateCartCount();

                    if (document.getElementById("cartItems")) {
                        await renderCart();
                    }
                } catch (error) {
                    console.error("Auth update error:", error);
                }

                if (firstCheck) {
                    firstCheck = false;
                    resolve();
                }
            },
            error => {
                console.error("Authentication error:", error);

                if (firstCheck) {
                    firstCheck = false;
                    resolve();
                }
            }
        );
    });
}


// CART DATABASE FUNCTIONS

async function getCart() {
    if (!currentUser) return [];

    const snapshot = await db
        .collection("carts")
        .doc(currentUser.uid)
        .collection("items")
        .get();

    return snapshot.docs.map(doc => ({
        cartItemId: doc.id,
        ...doc.data()
    }));
}

async function saveCart(cart) {
    if (!currentUser) {
        throw new Error("Please log in before using your cart.");
    }

    const cartRef = db
        .collection("carts")
        .doc(currentUser.uid)
        .collection("items");

    const oldItems = await cartRef.get();
    const batch = db.batch();

    oldItems.forEach(doc => {
        batch.delete(doc.ref);
    });

    cart.forEach(item => {
        const itemId = encodeURIComponent(item.name);

        batch.set(cartRef.doc(itemId), {
            productId: item.productId || item.id || null,
            name: item.name,
            price: Number(item.price),
            image: item.image,
            quantity: Number(item.quantity)
        });
    });

    await batch.commit();
    await updateCartCount();
}

async function updateCartCount() {
    const cart = await getCart();

    const count = cart.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
    );

    document.querySelectorAll(".cart-count").forEach(el => {
        el.textContent = count;
    });
}


// GENERAL FUNCTIONS

function formatPrice(price) {
    return "₱" + Number(price).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showToast(message) {
    const toast =
        document.getElementById("toast") ||
        document.getElementById("contactToast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 1800);
}


// PRODUCT PAGE

function getProduct(card) {
    return {
        id: card.dataset.productId,
        productId: card.dataset.productId,
        name: card.dataset.name,
        price: Number(card.dataset.price),
        image: card.querySelector("img").src
    };
}

function animateToCart(button) {
    if (!button) return;

    const product = button.closest(".product");
    const image = product?.querySelector("img");
    const cartLink = document.querySelector('a[href="cart.html"]');

    if (!image || !cartLink) return;

    const clone = image.cloneNode(true);
    const start = image.getBoundingClientRect();
    const end = cartLink.getBoundingClientRect();

    clone.className = "fly-item";
    clone.style.left = start.left + "px";
    clone.style.top = start.top + "px";

    document.body.appendChild(clone);

    requestAnimationFrame(() => {
        clone.style.left =
            (end.left + end.width / 2 - 27) + "px";

        clone.style.top =
            (end.top + end.height / 2 - 27) + "px";

        clone.style.transform = "scale(.25) rotate(15deg)";
        clone.style.opacity = ".3";
    });

    setTimeout(() => clone.remove(), 750);
}


// Find the current product stock in Firestore.
async function getProductStock(productId) {
    if (!productId) {
        throw new Error("This product is missing its Firestore ID.");
    }

    const doc = await db.collection("products").doc(productId).get();

    if (!doc.exists) {
        throw new Error("This perfume could not be found.");
    }

    return Number(doc.data().stock ?? 0);
}

async function addToCart(product, button) {
    if (!currentUser || currentUser.isAnonymous) {
        alert("Please log in before adding perfumes to your cart.");
        window.location.href = "login.html";
        return false;
    }

    try {
        const productId = product.productId || product.id;

        if (!productId) {
            throw new Error("Product ID is missing. Please refresh the Shop page.");
        }

        const availableStock = await getProductStock(productId);

        if (availableStock <= 0) {
            alert("Sorry, this perfume is out of stock.");
            return false;
        }

        const cart = await getCart();

        const existing = cart.find(
            item =>
                (item.productId && item.productId === productId) ||
                (!item.productId && item.name === product.name)
        );

        const requestedQuantity = existing
            ? Number(existing.quantity) + 1
            : 1;

        if (requestedQuantity > availableStock) {
            alert(
                `Only ${availableStock} bottle(s) of ${product.name} are available.`
            );
            return false;
        }

        if (existing) {
            existing.productId = productId;
            existing.quantity = requestedQuantity;
        } else {
            cart.push({
                ...product,
                id: productId,
                productId: productId,
                quantity: 1
            });
        }

        await saveCart(cart);

        if (button) {
            button.classList.add("added");

            const oldText = button.textContent;
            button.textContent = "✓ Added";

            setTimeout(() => {
                button.classList.remove("added");
                button.textContent = oldText;
            }, 1200);
        }

        animateToCart(button);
        showToast(product.name + " added to cart!");

        return true;

    } catch (error) {
        console.error("Add to cart failed:", error);
        alert("Could not add the perfume: " + error.message);
        return false;
    }
}


// PRODUCT LIST

async function loadProductsFromFirebase() {
    const grid = document.getElementById("productGrid");

    if (!grid) return;

    grid.innerHTML = "";

    try {
        const snapshot = await db.collection("products").get();

        console.log("Products loaded:", snapshot.size);

        snapshot.forEach(doc => {
            const product = doc.data();
            product.id = doc.id;
            product.productId = doc.id;

            const stock = Number(product.stock ?? 0);

            let stockText = "";
            let stockColor = "";

            if (stock <= 0) {
                stockText = "Out of Stock";
                stockColor = "#c0392b";
            } else if (stock <= 5) {
                stockText = `${stock} left - Low Stock`;
                stockColor = "#b7791f";
            } else {
                stockText = `${stock} bottles available`;
                stockColor = "#287a45";
            }

            const card = document.createElement("div");
            card.className = "product";

            card.dataset.productId = doc.id;
            card.dataset.name = product.name;
            card.dataset.price = product.price;
            card.dataset.stock = stock;

            card.innerHTML = `
                <img src="${product.image}" alt="${product.name}">

                <div class="product-info">
                    <span class="tag">${product.tag || "Perfume"}</span>

                    <h3>${product.name}</h3>

                    <p>${product.description || ""}</p>

                    <strong>${formatPrice(product.price)}</strong>

                    <p class="stock-message"
                       style="color: ${stockColor}; font-weight: bold; margin: 10px 0;">
                        ${stockText}
                    </p>

                    <div class="product-actions">
                        <button class="add-cart" ${stock <= 0 ? "disabled" : ""}>
                            Add to Cart
                        </button>

                        <button class="buy-now" ${stock <= 0 ? "disabled" : ""}>
                            Buy Now
                        </button>
                    </div>
                </div>
            `;

            grid.appendChild(card);
        });

        setupProductPage();

    } catch (error) {
        console.error("Error loading products:", error);
    }
}


// Refresh stock messages after a successful order.
async function refreshProductStock() {
    const cards = document.querySelectorAll(".product[data-product-id]");

    for (const card of cards) {
        try {
            const stock = await getProductStock(card.dataset.productId);

            card.dataset.stock = stock;

            const message = card.querySelector(".stock-message");
            const addButton = card.querySelector(".add-cart");
            const buyButton = card.querySelector(".buy-now");

            if (message) {
                if (stock <= 0) {
                    message.textContent = "Out of Stock";
                    message.style.color = "#c0392b";
                } else if (stock <= 5) {
                    message.textContent = `${stock} left - Low Stock`;
                    message.style.color = "#b7791f";
                } else {
                    message.textContent = `${stock} bottles available`;
                    message.style.color = "#287a45";
                }
            }

            if (addButton) addButton.disabled = stock <= 0;
            if (buyButton) buyButton.disabled = stock <= 0;

        } catch (error) {
            console.error("Could not refresh stock:", error);
        }
    }
}


function setupProductPage() {
    const cards = [...document.querySelectorAll(".product")];
    const search = document.getElementById("searchInput");
    const sort = document.getElementById("sortSelect");
    const grid = document.getElementById("productGrid");
    const noResults = document.getElementById("noResults");

    if (!cards.length) return;

    function refreshProducts() {
        const term = search ? search.value.toLowerCase() : "";

        cards.forEach(card => {
            const name = card.dataset.name.toLowerCase();
            card.style.display = name.includes(term) ? "" : "none";
        });

        const visible = cards.filter(
            card => card.style.display !== "none"
        );

        if (sort && sort.value === "low") {
            visible.sort(
                (a, b) => Number(a.dataset.price) - Number(b.dataset.price)
            );
        }

        if (sort && sort.value === "high") {
            visible.sort(
                (a, b) => Number(b.dataset.price) - Number(a.dataset.price)
            );
        }

        if (sort && sort.value === "name") {
            visible.sort(
                (a, b) => a.dataset.name.localeCompare(b.dataset.name)
            );
        }

        if (grid) {
            visible.forEach(card => grid.appendChild(card));
        }

        if (noResults) {
            noResults.classList.toggle("hidden", visible.length !== 0);
        }
    }

    if (search) {
        search.addEventListener("input", refreshProducts);
    }

    if (sort) {
        sort.addEventListener("change", refreshProducts);
    }

    cards.forEach(card => {
        const product = getProduct(card);
        const addButton = card.querySelector(".add-cart");
        const buyButton = card.querySelector(".buy-now");

        if (addButton) {
            addButton.addEventListener("click", async event => {
                await addToCart(product, event.currentTarget);
            });
        }

        if (buyButton) {
            buyButton.addEventListener("click", async event => {
                const button = event.currentTarget;
                button.disabled = true;

                try {
                    const added = await addToCart(product, button);

                    if (added) {
                        window.location.href = "cart.html?checkout=true";
                    }
                } finally {
                    button.disabled =
                        Number(card.dataset.stock) <= 0;
                }
            });
        }
    });
}


// CART PAGE

async function renderCart() {
    const items = document.getElementById("cartItems");
    const empty = document.getElementById("emptyCart");
    const content = document.getElementById("cartContent");

    if (!items || !empty || !content) return;

    try {
        const cart = await getCart();

        if (!cart.length) {
            items.innerHTML = "";
            content.classList.add("hidden");
            empty.classList.remove("hidden");

            const totalElement = document.getElementById("cartTotal");
            if (totalElement) totalElement.textContent = formatPrice(0);

            return;
        }

        content.classList.remove("hidden");
        empty.classList.add("hidden");

        items.innerHTML = cart.map((item, index) => `
            <article class="cart-item">
                <img src="${item.image}" alt="${item.name}">

                <div>
                    <h3>${item.name}</h3>
                    <p>${formatPrice(item.price)}</p>

                    <div class="qty">
                        <button data-action="minus"
                                data-index="${index}">−</button>

                        <strong>${item.quantity}</strong>

                        <button data-action="plus"
                                data-index="${index}">+</button>
                    </div>
                </div>

                <div>
                    <strong>
                        ${formatPrice(item.price * item.quantity)}
                    </strong>

                    <br>

                    <button class="remove"
                            data-action="remove"
                            data-index="${index}">
                        Remove
                    </button>
                </div>
            </article>
        `).join("");

        const total = cart.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        const totalElement = document.getElementById("cartTotal");
        if (totalElement) totalElement.textContent = formatPrice(total);

    } catch (error) {
        console.error("Error rendering cart:", error);
    }
}


// Find a product ID for older cart items that don't have one yet.
async function getCartProductId(item) {
    if (item.productId) return item.productId;

    const snapshot = await db
        .collection("products")
        .where("name", "==", item.name)
        .limit(1)
        .get();

    if (snapshot.empty) {
        throw new Error(`Could not find product: ${item.name}`);
    }

    return snapshot.docs[0].id;
}


function setupCartPage() {
    const items = document.getElementById("cartItems");

    if (!items) return;

    const clearButton = document.getElementById("clearCart");
    const checkoutButton = document.getElementById("checkoutBtn");
    const closeButton = document.getElementById("closeModal");
    const placeOrderButton = document.getElementById("placeOrder");
    const checkoutModal = document.getElementById("checkoutModal");

    renderCart();

    items.addEventListener("click", async event => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        try {
            const index = Number(button.dataset.index);
            const action = button.dataset.action;
            const cart = await getCart();

            if (!cart[index]) return;

            if (action === "plus") {
                const productId = await getCartProductId(cart[index]);
                const stock = await getProductStock(productId);

                if (Number(cart[index].quantity) + 1 > stock) {
                    alert(`Only ${stock} bottle(s) are available.`);
                    return;
                }

                cart[index].productId = productId;
                cart[index].quantity++;
            } else if (action === "minus") {
                cart[index].quantity--;
            }

            if (action === "remove" || cart[index].quantity <= 0) {
                cart.splice(index, 1);
            }

            await saveCart(cart);
            await renderCart();

        } catch (error) {
            console.error("Could not update cart:", error);
            alert("Could not update your cart: " + error.message);
        }
    });

    if (clearButton) {
        clearButton.addEventListener("click", async () => {
            if (!confirm("Clear all items from your cart?")) return;

            try {
                await saveCart([]);
                await renderCart();
            } catch (error) {
                alert("Could not clear your cart: " + error.message);
            }
        });
    }

    if (checkoutButton) {
        checkoutButton.addEventListener("click", async () => {
            try {
                const cart = await getCart();

                if (!cart.length) {
                    alert("Your cart is empty.");
                    return;
                }

                const summary = document.getElementById("modalSummary");
                const modalTotal = document.getElementById("modalTotal");

                const total = cart.reduce(
                    (sum, item) => sum + item.price * item.quantity,
                    0
                );

                if (summary) {
                    summary.textContent = cart.map(item =>
                        `${item.quantity} × ${item.name}`
                    ).join("\n");
                }

                if (modalTotal) {
                    modalTotal.textContent = formatPrice(total);
                }

                if (checkoutModal) {
                    checkoutModal.classList.remove("hidden");
                }

            } catch (error) {
                console.error("Checkout error:", error);
                alert("Could not open checkout: " + error.message);
            }
        });
    }

    if (closeButton && checkoutModal) {
        closeButton.addEventListener("click", () => {
            checkoutModal.classList.add("hidden");
        });
    }


    // PLACE ORDER AND REDUCE STOCK ATOMICALLY

    if (placeOrderButton) {
        placeOrderButton.addEventListener("click", async () => {
            if (placeOrderButton.disabled) return;

            placeOrderButton.disabled = true;

            try {
                const user = firebase.auth().currentUser;

                if (!user || user.isAnonymous) {
                    alert("Please log in before placing an order.");
                    window.location.href = "login.html";
                    return;
                }

                const cart = await getCart();

                if (!cart.length) {
                    alert("Your cart is empty.");
                    return;
                }

                // Resolve product IDs for older cart items.
                for (const item of cart) {
                    item.productId = await getCartProductId(item);
                }

                // One order document for this purchase.
                const orderRef = db.collection("orders").doc();

                const orderItems = cart.map(item => ({
                    productId: item.productId,
                    name: item.name,
                    price: Number(item.price),
                    image: item.image,
                    quantity: Number(item.quantity)
                }));

                const total = orderItems.reduce(
                    (sum, item) => sum + item.price * item.quantity,
                    0
                );

                await db.runTransaction(async transaction => {
                    // READ ALL PRODUCTS BEFORE WRITING ANYTHING.
                    const productSnapshots = [];

                    for (const item of orderItems) {
                        const productRef = db
                            .collection("products")
                            .doc(item.productId);

                        const productSnapshot =
                            await transaction.get(productRef);

                        if (!productSnapshot.exists) {
                            throw new Error(
                                `${item.name} is no longer available.`
                            );
                        }

                        productSnapshots.push({
                            ref: productRef,
                            snapshot: productSnapshot,
                            item: item
                        });
                    }

                    // Validate every item's stock before making changes.
                    for (const entry of productSnapshots) {
                        const stock = Number(
                            entry.snapshot.data().stock ?? 0
                        );

                        if (stock < entry.item.quantity) {
                            throw new Error(
                                `Not enough stock for ${entry.item.name}. ` +
                                `Available: ${stock}, requested: ${entry.item.quantity}.`
                            );
                        }
                    }

                    // Deduct stock.
                    for (const entry of productSnapshots) {
                        const stock = Number(
                            entry.snapshot.data().stock ?? 0
                        );

                        transaction.update(entry.ref, {
                            stock: stock - entry.item.quantity
                        });
                    }

                    // Save the order in the SAME transaction.
                    transaction.set(orderRef, {
                        userId: user.uid,
                        name: user.displayName || "",
                        email: user.email || "",
                        items: orderItems,
                        total: total,
                        status: "To Ship",
                        createdAt:
                            firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                // Clear the cart only after the transaction succeeds.
                await saveCart([]);

                if (checkoutModal) {
                    checkoutModal.classList.add("hidden");
                }

                await renderCart();
                await refreshProductStock();

                alert(
                    "Thank you for your order! " +
                    "Your order was saved and stock was updated successfully."
                );

            } catch (error) {
                console.error("Error placing order:", error);

                alert(
                    "Could not place your order.\n" +
                    error.message +
                    "\n\nYour order was not accepted by the stock transaction."
                );

            } finally {
                placeOrderButton.disabled = false;
            }
        });
    }

    const params = new URLSearchParams(window.location.search);

    if (params.get("checkout") === "true" && checkoutButton) {
        checkoutButton.click();
    }
}


// CONTACT PAGE


function setupContactPage() {
    const form = document.getElementById("contactForm");
    if (!form) return;

    const nameInput = document.getElementById("contactName");
    const emailInput = document.getElementById("contactEmail");
    const messageInput = document.getElementById("contactMessage");
    const submitButton = document.getElementById("sendMessageButton");
    const status = document.getElementById("contactStatus");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const message = messageInput.value.trim();

        if (!name || !email || !message) {
            if (status) status.textContent = "Please fill in all fields.";
            return;
        }

        submitButton.disabled = true;
        if (status) status.textContent = "Sending your message...";

        try {
            await db.collection("messages").add({
                name: name,
                email: email,
                message: message,
                status: "unread",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (status) {
                status.textContent = "Your message was sent successfully!";
            }

            if (typeof showToast === "function") {
                showToast("Message sent successfully!");
            }

            form.reset();
        } catch (error) {
    console.error("Error saving contact message:", error);

    if (status) {
        status.textContent =
            "Error: " + error.code + " — " + error.message;
    }
}
        finally {
            submitButton.disabled = false;
        }
    });
}


// HOME PAGE

function setupHomePage() {
    document.querySelectorAll(".hero-buttons a").forEach(link => {
        link.addEventListener("click", () => {
            link.classList.add("clicked");
        });
    });
}


// ABOUT PAGE

function setupAboutPage() {
    document.querySelectorAll(".about-card").forEach((card, index) => {
        card.style.animationDelay = (index * 80) + "ms";
    });
}


// LOGIN AND SIGNUP PAGE


function setupAuthPage() {
    const form = document.getElementById("authForm");
    if (!form) return;

    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const title = document.getElementById("formTitle");
    const button = document.getElementById("submitButton");
    const switchText = document.getElementById("switchText");
    const switchLink = document.getElementById("switchMode");
    const message = document.getElementById("authMessage");

    let isSignup = false;

    if (nameInput) {
        nameInput.hidden = true;
        nameInput.required = false;
    }

    if (passwordInput) {
        passwordInput.autocomplete = "current-password";
    }

    if (switchLink) {
        switchLink.addEventListener("click", event => {
            event.preventDefault();

            isSignup = !isSignup;

            if (nameInput) {
                nameInput.hidden = !isSignup;
                nameInput.required = isSignup;
            }

            if (passwordInput) {
                passwordInput.autocomplete = isSignup
                    ? "new-password"
                    : "current-password";
            }

            if (title) {
                title.textContent = isSignup
                    ? "Create your account"
                    : "Welcome back";
            }

            if (button) {
                button.textContent = isSignup
                    ? "Create Account"
                    : "Log In";
            }

            if (switchText) {
                switchText.textContent = isSignup
                    ? "Already have an account?"
                    : "Don't have an account?";
            }

            switchLink.textContent = isSignup ? "Log In" : "Sign Up";

            if (message) message.textContent = "";
        });
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (message) message.textContent = "Please wait...";
        if (button) button.disabled = true;

        try {
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (isSignup) {
                const name = nameInput.value.trim();

                const result = await firebase.auth()
                    .createUserWithEmailAndPassword(email, password);

                await result.user.updateProfile({
                    displayName: name
                });

                await db.collection("users")
                    .doc(result.user.uid)
                    .set({
                        name: name,
                        email: email,
                        createdAt:
                            firebase.firestore.FieldValue.serverTimestamp()
                    });

                // Send verification email after creating the account.
                await result.user.sendEmailVerification();

                if (message) {
                    message.textContent =
                        "Account created! Check your email and click the verification link.";
                }

            } else {
                const result = await firebase.auth()
                    .signInWithEmailAndPassword(email, password);

                const user = result.user;

                // Refresh the user's verification status.
                await user.reload();

                if (!user.emailVerified) {
                    await user.sendEmailVerification();

                    if (message) {
                        message.textContent =
                            "Your email is not verified yet. " +
                            "We sent you a verification email. " +
                            "Please check your inbox and click the link.";
                    }

                    return;
                }

                if (message) {
                    message.textContent = "Login successful!";
                }

                setTimeout(() => {
                    window.location.href = "home.html";
                }, 700);
            }

        } catch (error) {
            console.error("Authentication error:", error);

            if (message) {
                message.textContent = error.message;
            }

        } finally {
            if (button) button.disabled = false;
        }
    });
}


function setupProfilePage() {
    const nameElement = document.getElementById("profileName");
    const emailElement = document.getElementById("profileEmail");
    const logoutButton = document.getElementById("logoutButton");
    const message = document.getElementById("profileMessage");

    if (!nameElement && !emailElement && !logoutButton) return;

    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.replace("login.html");
            return;
        }

        if (emailElement) {
            emailElement.textContent = user.email || "No email available";
        }

        let displayName = user.displayName;

        // If Authentication has no name, check Firestore.
        if (!displayName) {
    try {
        // First, search using the Firebase UID.
        let userDoc = await db.collection("users")
            .doc(user.uid)
            .get();

        // If not found, search using the signed-in email.
        if (!userDoc.exists && user.email) {
            const snapshot = await db.collection("users")
                .where("email", "==", user.email)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                userDoc = snapshot.docs[0];
            }
        }

        if (userDoc.exists) {
            displayName = userDoc.data().name;
        }
    } catch (error) {
        console.error("Could not load profile name:", error);
    }
}
        if (nameElement) {
            nameElement.textContent = displayName || "Name not available";
        }
    });

    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            logoutButton.disabled = true;

            try {
                await firebase.auth().signOut();
                window.location.replace("login.html");
            } catch (error) {
                console.error("Logout error:", error);

                if (message) {
                    message.textContent =
                        "Could not log out. Please try again.";
                }

                logoutButton.disabled = false;
            }
        });
    }
}

// START WEBSITE

document.addEventListener("DOMContentLoaded", async () => {
    await initAuth();
    await updateCartCount();
    await loadProductsFromFirebase();

    setupCartPage();
    setupContactPage();
    setupHomePage();
    setupAboutPage();
    setupAuthPage();
    setupProfilePage();
});
