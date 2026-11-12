# Noiré Perfumes — two websites, one Firebase project

```
shop/        Customer website   -> https://noire-perfumes.web.app
admin/       Admin website      -> https://noire-perfumes-admin.web.app
functions/   Optional Cloud Functions (need the Blaze plan)
firestore.rules   Security rules shared by both sites
```

Both sites use the SAME Firebase project (`noire-perfumes`), so they share the
same Authentication users and Firestore data. That is the "connection":

| Shop (customers)                | Admin                                       |
| ------------------------------- | ------------------------------------------- |
| Reads `products` (price, stock) | Adds / edits / deletes products, sets stock |
| Creates `orders`, lowers stock  | Sees all orders, changes status             |
| Customer sees status tabs       | Status To Ship → To Receive → Completed     |
| Contact form writes `messages`  | Reads / replies to / deletes messages       |
| Sign-up writes `users`          | Lists customers                             |

Links between them: the shop menu shows **Admin Panel** (admin email only) and
the admin header has **View Shop**. URLs are set in `shop/config.js` and
`admin/config.js`.

## One-time setup

```bash
npm install -g firebase-tools
firebase.cmd login

# create the second Hosting site (name must be globally unique)
firebase.cmd hosting:sites:create noire-perfumes-admin

# map the targets (only needed if you pick different site names)
firebase.cmd target:apply hosting shop  noire-perfumes
firebase.cmd target:apply hosting admin noire-perfumes-admin
```

If you used a different admin site name, update `ADMIN_URL` in `shop/config.js`
and `SHOP_URL` in `admin/config.js`.

## Deploy

```bash
firebase.cmd deploy --only firestore:rules      # do this first
firebase.cmd deploy --only hosting:shop
firebase.cmd deploy --only hosting:admin
```

## Run locally

```bash
python -m http.server 5000 --directory shop     # http://localhost:5000
python -m http.server 5001 --directory admin    # http://localhost:5001
```

The config files switch to these localhost URLs automatically.

## Things to know

- **Separate login for each site.** Browsers keep sign-in per website address,
  so being logged in on the shop does not log you into the admin site. Log in
  once on `admin/login.html` with the admin account (verified email).
- **Product photos** live in `shop/images/`. In the admin form enter the path
  (`images/xyz.jpg`) after adding the file to that folder and redeploying the
  shop, or paste a full `https://` image URL.
- **Firestore rules:** the original `firestore.rules` was an empty file. The new
  one lets customers touch only their own cart/orders/profile, lets only the
  admin change order status, products, and messages, and lets checkout only
  _lower_ a product's stock.
- The Cloud Functions are not used by either site (no Blaze plan needed). Their
  order statuses were updated to match the shop's.
