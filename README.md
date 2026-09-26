# Sazy and Cream2Go

A landing page for Sazy Station and Cream2Go.

## Run the app

The staff login and protected dashboards require the Node server. Use Node.js 22.13 or newer (Node 24 is recommended; the server uses Node's built-in SQLite module).

1. Copy `.env.example` to `.env`.
2. Set `ADMIN_PASSWORD` in `.env` to a unique password with at least 12 characters. Set `ADMIN_USERNAME` if you want a different administrator username.
3. Start the server with `node server.js`.
4. Open `http://localhost:3000` and choose **Sign In**. The initial administrator account is created on first server start.

Set `CONTACT_EMAIL` in `.env` to the real business email address to enable the contact form's prefilled email draft. Until configured, the contact page clearly explains that message delivery is unavailable and still provides direct links to order tracking, the menu, and station services.

The administrator can create cashier accounts from the admin dashboard. Cashier passwords must be at least 12 characters and are stored as scrypt hashes in `data/cream2go.sqlite`. Sessions use random, expiring, HTTP-only cookies. The `data/` database and `.env` are local and ignored by Git.

Run the authentication and access-control tests with `node --test tests/auth.test.js`. Tests use a temporary database and do not modify your local accounts.

Do not expose the development server directly to the public internet. Production deployment should use HTTPS, a managed secret store, backups for the SQLite database, and appropriate operational monitoring. Set `NODE_ENV=production` when served over HTTPS to enable the Secure cookie flag.
