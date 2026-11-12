"use strict";

const CFG = window.NOIRE_ADMIN_CONFIG;
const ADMIN_EMAIL = CFG.ADMIN_EMAIL.toLowerCase();

firebase.initializeApp(CFG.firebase);
const auth = firebase.auth();
const db = firebase.firestore();

// Same status flow the shop uses on the customer "My Purchases" tabs.
const STATUSES = ["Placed", "Processing", "To Ship", "To Receive", "Completed"];
const PENDING = ["placed", "processing", "to ship"];
const LOW_STOCK = 5;

const state = { orders: [], products: [], users: [], messages: [] };

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function money(value) {
  const n = Number(value);
  return "₱" + (Number.isFinite(n) ? n : 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function fmtDate(ts) {
  return ts && ts.toDate
    ? ts.toDate().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "—";
}

function millis(ts) { return ts && ts.toMillis ? ts.toMillis() : 0; }

// Product images are stored as paths like "images/x.jpg" that live on the SHOP site.
function imageUrl(src) {
  src = String(src || "").replace(/\\/g, "/");
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  return CFG.SHOP_URL.replace(/\/+$/, "") + "/" + src.replace(/^\/+/, "");
}

function notify(text, isError) {
  const box = $("message");
  box.textContent = text;
  box.style.display = "block";
  box.style.background = isError ? "#ffe5e5" : "#e4f5e8";
  box.style.color = isError ? "#a00000" : "#175c2d";
  clearTimeout(notify.t);
  notify.t = setTimeout(() => { box.style.display = "none"; }, isError ? 9000 : 3500);
}

function isAdmin(user) {
  return !!user && (user.email || "").toLowerCase() === ADMIN_EMAIL && user.emailVerified;
}

/* ---------- Stats ---------- */
function updateStats() {
  $("statUsers").textContent = state.users.length;
  $("statOrders").textContent = state.orders.length;
  $("statPending").textContent = state.orders.filter(
    o => PENDING.includes(String(o.status || "Placed").toLowerCase())
  ).length;
  $("statRevenue").textContent = money(
    state.orders.reduce((sum, o) => sum + Number(o.total || 0), 0)
  );
  $("statLowStock").textContent = state.products.filter(
    p => Number(p.stock || 0) <= LOW_STOCK
  ).length;

  const unread = state.messages.filter(m => (m.status || "unread") === "unread").length;
  $("statMessages").textContent = unread;
  $("msgBadge").textContent = unread;
  $("msgBadge").classList.toggle("hidden", unread === 0);
}

/* ---------- Orders ---------- */
async function loadOrders() {
  $("ordersTable").innerHTML = '<tr><td colspan="6">Loading orders...</td></tr>';
  try {
    const snap = await db.collection("orders").get();
    state.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.orders.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    renderOrders();
    updateStats();
  } catch (e) {
    $("ordersTable").innerHTML = '<tr><td colspan="6">Unable to load orders.</td></tr>';
    notify("Orders could not be loaded: " + e.message, true);
  }
}

function renderOrders() {
  const filter = $("orderFilter").value;
  const rows = state.orders.filter(o => filter === "all" || (o.status || "Placed") === filter);

  if (!rows.length) {
    $("ordersTable").innerHTML = '<tr><td colspan="6">No orders found.</td></tr>';
    return;
  }

  $("ordersTable").innerHTML = rows.map(o => {
    const current = o.status || "Placed";
    const options = [...new Set([...STATUSES, current])].map(s =>
      `<option value="${esc(s)}" ${s === current ? "selected" : ""}>${esc(s)}</option>`
    ).join("");

    const items = (Array.isArray(o.items) ? o.items : []).map(i =>
      `<li>${Number(i.quantity || 0)} × ${esc(i.name)}</li>`
    ).join("");

    return `
      <tr>
        <td>${fmtDate(o.createdAt)}<br><span class="muted">#${esc(o.id.slice(0, 8))}</span></td>
        <td>${esc(o.name || "Customer")}<br><span class="muted">${esc(o.email || "")}</span></td>
        <td><ul class="items-list">${items}</ul></td>
        <td>${money(o.total)}</td>
        <td>${esc(current)}${o.rating ? `<br><span class="muted">★ ${Number(o.rating)}/5</span>` : ""}</td>
        <td>
          <select data-status-for="${esc(o.id)}">${options}</select>
          <button data-save-order="${esc(o.id)}">Save</button>
        </td>
      </tr>`;
  }).join("");
}

async function saveOrderStatus(orderId, status) {
  if (!STATUSES.includes(status)) return notify("Invalid order status.", true);
  try {
    await db.collection("orders").doc(orderId).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    notify("Order status updated. The customer sees it in My Purchases.");
    await loadOrders();
  } catch (e) {
    notify("Could not update the order: " + e.message, true);
  }
}

/* ---------- Products ---------- */
async function loadProducts() {
  $("productsTable").innerHTML = '<tr><td colspan="6">Loading products...</td></tr>';
  try {
    const snap = await db.collection("products").get();
    state.products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    renderProducts();
    updateStats();
  } catch (e) {
    $("productsTable").innerHTML = '<tr><td colspan="6">Unable to load products.</td></tr>';
    notify("Products could not be loaded: " + e.message, true);
  }
}

function stockPill(stock) {
  if (stock <= 0) return '<span class="pill out">Out of stock</span>';
  if (stock <= LOW_STOCK) return '<span class="pill low">Low stock</span>';
  return '<span class="pill">In stock</span>';
}

function renderProducts() {
  if (!state.products.length) {
    $("productsTable").innerHTML = '<tr><td colspan="6">No products yet. Add one above.</td></tr>';
    return;
  }

  $("productsTable").innerHTML = state.products.map(p => {
    const stock = Number(p.stock || 0);
    const img = imageUrl(p.image);
    return `
      <tr>
        <td>${img ? `<img class="thumb" src="${esc(img)}" alt="" onerror="this.style.visibility='hidden'">` : ""}</td>
        <td><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.tag || "Perfume")}</span></td>
        <td><input type="number" min="0" step="0.01" value="${Number(p.price || 0)}" data-price-for="${esc(p.id)}"></td>
        <td><input type="number" min="0" step="1" value="${stock}" data-stock-for="${esc(p.id)}"></td>
        <td>${stockPill(stock)}</td>
        <td>
          <button data-save-product="${esc(p.id)}">Save</button>
          <button class="danger" data-delete-product="${esc(p.id)}">Delete</button>
        </td>
      </tr>`;
  }).join("");
}

async function saveProduct(id) {
  const price = Number(document.querySelector(`[data-price-for="${CSS.escape(id)}"]`).value);
  const stock = Math.floor(Number(document.querySelector(`[data-stock-for="${CSS.escape(id)}"]`).value));
  if (!(price >= 0) || !(stock >= 0)) return notify("Price and stock must be 0 or more.", true);

  try {
    await db.collection("products").doc(id).update({
      price, stock,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    notify("Product updated. The shop now shows the new price and stock.");
    await loadProducts();
  } catch (e) {
    notify("Could not update the product: " + e.message, true);
  }
}

async function deleteProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!confirm(`Delete "${p ? p.name : "this product"}" from the shop? This cannot be undone.`)) return;
  try {
    await db.collection("products").doc(id).delete();
    notify("Product deleted.");
    await loadProducts();
  } catch (e) {
    notify("Could not delete the product: " + e.message, true);
  }
}

async function addProduct() {
  const name = $("newName").value.trim();
  const price = Number($("newPrice").value);
  const stock = Math.floor(Number($("newStock").value || 0));
  if (!name) return notify("Please enter a product name.", true);
  if (!(price >= 0) || $("newPrice").value === "") return notify("Please enter a valid price.", true);
  if (!(stock >= 0)) return notify("Stock must be 0 or more.", true);

  try {
    await db.collection("products").add({
      name, price, stock,
      tag: $("newTag").value.trim() || "Perfume",
      image: $("newImage").value.trim(),
      description: $("newDescription").value.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    ["newName", "newPrice", "newTag", "newImage", "newDescription"].forEach(i => { $(i).value = ""; });
    $("newStock").value = 0;
    notify("Product added. It is now live on the shop.");
    await loadProducts();
  } catch (e) {
    notify("Could not add the product: " + e.message, true);
  }
}

/* ---------- Messages ---------- */
async function loadMessages() {
  try {
    const snap = await db.collection("messages").get();
    state.messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.messages.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    renderMessages();
    updateStats();
  } catch (e) {
    $("messagesList").textContent = "Unable to load messages.";
    notify("Messages could not be loaded: " + e.message, true);
  }
}

function renderMessages() {
  if (!state.messages.length) {
    $("messagesList").textContent = "No messages yet.";
    return;
  }

  $("messagesList").innerHTML = state.messages.map(m => {
    const unread = (m.status || "unread") === "unread";
    return `
      <article class="msg-card ${unread ? "unread" : ""}">
        <div class="msg-head">
          <span><strong>${esc(m.name)}</strong> · ${esc(m.email)}</span>
          <span class="muted">${fmtDate(m.createdAt)}</span>
        </div>
        <div class="msg-body">${esc(m.message)}</div>
        <div class="msg-actions">
          <button class="secondary" data-toggle-message="${esc(m.id)}">
            ${unread ? "Mark as read" : "Mark as unread"}
          </button>
          <a href="mailto:${esc(m.email)}?subject=Re: your message to Noiré Perfumes">Reply by email</a>
          <button class="danger" data-delete-message="${esc(m.id)}">Delete</button>
        </div>
      </article>`;
  }).join("");
}

async function toggleMessage(id) {
  const m = state.messages.find(x => x.id === id);
  if (!m) return;
  try {
    await db.collection("messages").doc(id).update({
      status: (m.status || "unread") === "unread" ? "read" : "unread"
    });
    await loadMessages();
  } catch (e) { notify("Could not update the message: " + e.message, true); }
}

async function deleteMessage(id) {
  if (!confirm("Delete this message?")) return;
  try {
    await db.collection("messages").doc(id).delete();
    await loadMessages();
  } catch (e) { notify("Could not delete the message: " + e.message, true); }
}

/* ---------- Users ---------- */
async function loadUsers() {
  $("usersTable").innerHTML = '<tr><td colspan="4">Loading users...</td></tr>';
  try {
    const snap = await db.collection("users").get();
    state.users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderUsers();
    updateStats();
  } catch (e) {
    $("usersTable").innerHTML = '<tr><td colspan="4">Unable to load users.</td></tr>';
    notify("Users could not be loaded: " + e.message, true);
  }
}

function renderUsers() {
  const q = $("userSearch").value.trim().toLowerCase();
  const rows = state.users.filter(u =>
    String(u.name || u.displayName || "").toLowerCase().includes(q) ||
    String(u.email || "").toLowerCase().includes(q)
  );

  $("usersTable").innerHTML = rows.length ? rows.map(u => `
    <tr>
      <td>${esc(u.name || u.displayName || "No name")}</td>
      <td>${esc(u.email || "No email")}</td>
      <td>${fmtDate(u.createdAt)}</td>
      <td class="muted">${esc(u.uid)}</td>
    </tr>`).join("") : '<tr><td colspan="4">No users found.</td></tr>';
}

/* ---------- Tabs & events ---------- */
function showTab(name) {
  document.querySelectorAll("#tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name));
  ["orders", "products", "messages", "users"].forEach(t =>
    $("tab-" + t).classList.toggle("hidden", t !== name));
  history.replaceState(null, "", "#" + name);
}

function setupEvents() {
  $("orderFilter").innerHTML += STATUSES.map(s => `<option>${esc(s)}</option>`).join("");
  $("orderFilter").addEventListener("change", renderOrders);
  $("refreshOrders").addEventListener("click", loadOrders);
  $("refreshUsers").addEventListener("click", loadUsers);
  $("userSearch").addEventListener("input", renderUsers);
  $("addProduct").addEventListener("click", addProduct);

  $("tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if (b) showTab(b.dataset.tab);
  });

  $("tab-orders").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-save-order]");
    if (!btn) return;
    const id = btn.dataset.saveOrder;
    const sel = document.querySelector(`select[data-status-for="${CSS.escape(id)}"]`);
    if (!sel || !confirm("Save this order status?")) return;
    btn.disabled = true;
    await saveOrderStatus(id, sel.value);
  });

  $("tab-products").addEventListener("click", async e => {
    const save = e.target.closest("button[data-save-product]");
    const del = e.target.closest("button[data-delete-product]");
    if (save) { save.disabled = true; await saveProduct(save.dataset.saveProduct); save.disabled = false; }
    if (del) await deleteProduct(del.dataset.deleteProduct);
  });

  $("tab-messages").addEventListener("click", async e => {
    const t = e.target.closest("button[data-toggle-message]");
    const d = e.target.closest("button[data-delete-message]");
    if (t) await toggleMessage(t.dataset.toggleMessage);
    if (d) await deleteMessage(d.dataset.deleteMessage);
  });

  async function logout() {
    await auth.signOut();
    location.replace("login.html");
  }
  $("logoutButton").addEventListener("click", logout);
  $("deniedLogout").addEventListener("click", logout);
  $("shopLink").href = CFG.SHOP_URL;
}

/* ---------- Auth gate ---------- */
let started = false;

auth.onAuthStateChanged(async user => {
  if (!user) {
    location.replace("login.html");
    return;
  }

  try {
    await user.reload();
    const current = auth.currentUser;

    if (!isAdmin(current)) {
      $("app").classList.add("hidden");
      $("denied").classList.remove("hidden");
      return;
    }

    // Refresh the token so Firestore rules see the verified email.
    await current.getIdToken(true);

    $("denied").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("adminEmail").textContent = current.email;

    if (started) return;
    started = true;

    setupEvents();
    const tab = location.hash.replace("#", "");
    if (["orders", "products", "messages", "users"].includes(tab)) showTab(tab);

    await Promise.all([loadOrders(), loadProducts(), loadMessages(), loadUsers()]);
  } catch (e) {
    $("app").classList.remove("hidden");
    notify("Could not verify your account: " + e.message, true);
  }
});
