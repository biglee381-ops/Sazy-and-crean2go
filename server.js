"use strict";

const { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const scryptAsync = promisify(scrypt);
const ROOT = __dirname;
const SESSION_COOKIE = "cream2go_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const PASSWORD_BYTES = 64;
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const loginAttempts = new Map();

function loadEnvironment() {
	const envPath = path.join(ROOT, ".env");
	if (!fs.existsSync(envPath)) return;
	for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
		if (match && process.env[match[1]] === undefined) {
			process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
		}
	}
}

loadEnvironment();

const adminUsername = (process.env.ADMIN_USERNAME || "admin").trim();
const adminPassword = process.env.ADMIN_PASSWORD || "";
if (adminUsername.length < 3 || adminUsername.length > 32 || !/^[a-zA-Z0-9._-]+$/.test(adminUsername)) {
	throw new Error("ADMIN_USERNAME must be 3-32 letters, numbers, periods, underscores, or hyphens.");
}
if (adminPassword.length < 12) {
	throw new Error("Set ADMIN_PASSWORD to a unique password with at least 12 characters in .env.");
}

const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(ROOT, "data", "cream2go.sqlite"));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
	PRAGMA foreign_keys = ON;
	PRAGMA journal_mode = WAL;
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		username TEXT NOT NULL COLLATE NOCASE UNIQUE,
		password_salt TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
		created_at TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		csrf_token TEXT NOT NULL,
		expires_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
`);

const findUserByUsername = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE");
if (!findUserByUsername.get(adminUsername)) {
	const salt = randomBytes(16);
	const hash = scryptSync(adminPassword, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
	db.prepare("INSERT INTO users (id, name, username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, 'admin', ?)")
		.run(randomBytes(16).toString("hex"), "Store administrator", adminUsername, salt.toString("hex"), hash.toString("hex"), new Date().toISOString());
	console.log(`Created initial administrator account: ${adminUsername}`);
}

const queries = {
	userById: db.prepare("SELECT id, name, username, role FROM users WHERE id = ?"),
	userByUsername: findUserByUsername,
	insertUser: db.prepare("INSERT INTO users (id, name, username, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
	listCashiers: db.prepare("SELECT id, name, username, created_at AS createdAt FROM users WHERE role = 'cashier' ORDER BY name COLLATE NOCASE"),
	deleteCashier: db.prepare("DELETE FROM users WHERE id = ? AND role = 'cashier'"),
	insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)"),
	getSession: db.prepare("SELECT user_id AS userId, csrf_token AS csrfToken, expires_at AS expiresAt FROM sessions WHERE token_hash = ?"),
	deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
	deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?")
};

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const publicUser = (user) => ({ id: user.id, name: user.name, username: user.username, role: user.role });
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
let lastSessionCleanup = 0;

function sendJson(response, status, payload, extraHeaders = {}) {
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "same-origin",
		...extraHeaders
	});
	response.end(JSON.stringify(payload));
}

function cookieToken(request) {
	const cookieHeader = request.headers.cookie || "";
	for (const part of cookieHeader.split(";")) {
		const [key, ...value] = part.trim().split("=");
		if (key === SESSION_COOKIE) return value.join("=");
	}
	return "";
}

function currentSession(request) {
	const token = cookieToken(request);
	if (!/^[a-f0-9]{64}$/.test(token)) return null;
	const now = Date.now();
	if (now - lastSessionCleanup > 60 * 60 * 1000) {
		queries.deleteExpiredSessions.run(now);
		lastSessionCleanup = now;
	}
	const session = queries.getSession.get(hashToken(token));
	if (!session || session.expiresAt <= now) return null;
	const user = queries.userById.get(session.userId);
	return user ? { token, csrfToken: session.csrfToken, user } : null;
}

function hasSameOrigin(request) {
	const origin = request.headers.origin;
	if (!origin) return true;
	try {
		return new URL(origin).host === request.headers.host;
	} catch {
		return false;
	}
}

function rateLimitLogin(request) {
	const key = request.socket.remoteAddress || "unknown";
	const entry = loginAttempts.get(key);
	const now = Date.now();
	if (!entry || now >= entry.resetAt) {
		loginAttempts.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
	}
	const current = loginAttempts.get(key);
	if (current.count >= 10) return false;
	current.count += 1;
	return true;
}

function readJson(request) {
	return new Promise((resolve, reject) => {
		let body = "";
		request.on("data", (chunk) => {
			body += chunk;
			if (Buffer.byteLength(body) > 16 * 1024) {
				reject(new Error("Request body too large."));
				request.destroy();
			}
		});
		request.on("end", () => {
			try {
				resolve(JSON.parse(body || "{}"));
			} catch {
				reject(new Error("Invalid JSON body."));
			}
		});
		request.on("error", reject);
	});
}

function validPassword(password) {
	return typeof password === "string" && password.length >= 12 && password.length <= 128;
}

async function passwordMatches(password, user) {
	const expected = Buffer.from(user.password_hash, "hex");
	const actual = await scryptAsync(password, Buffer.from(user.password_salt, "hex"), PASSWORD_BYTES, PASSWORD_OPTIONS);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function setSessionCookie(token) {
	return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secureCookie}`;
}

function clearSessionCookie() {
	return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secureCookie}`;
}

function requireRole(request, response, role) {
	const session = currentSession(request);
	if (!session) {
		sendJson(response, 401, { error: "Please sign in to continue." });
		return null;
	}
	if (session.user.role !== role) {
		sendJson(response, 403, { error: "You do not have permission to do that." });
		return null;
	}
	return session;
}

function requireCsrf(request, response, session) {
	if (!hasSameOrigin(request)) {
		sendJson(response, 403, { error: "Request origin was rejected." });
		return false;
	}
	if (request.headers["x-csrf-token"] !== session.csrfToken) {
		sendJson(response, 403, { error: "Security token expired. Refresh and try again." });
		return false;
	}
	return true;
}

async function handleApi(request, response, url) {
	if (request.method === "GET" && url.pathname === "/api/contact/config") {
		const email = process.env.CONTACT_EMAIL || "";
		return sendJson(response, 200, { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "" });
	}

	if (request.method === "GET" && url.pathname === "/api/auth/session") {
		const session = currentSession(request);
		return sendJson(response, 200, { user: session ? publicUser(session.user) : null, csrfToken: session?.csrfToken || null });
	}

	if (request.method === "POST" && url.pathname === "/api/auth/login") {
		if (!hasSameOrigin(request)) return sendJson(response, 403, { error: "Request origin was rejected." });
		if (!rateLimitLogin(request)) return sendJson(response, 429, { error: "Too many sign-in attempts. Try again in 15 minutes." });
		let input;
		try { input = await readJson(request); } catch (error) { return sendJson(response, 400, { error: error.message }); }
		const username = typeof input.username === "string" ? input.username.trim() : "";
		const password = typeof input.password === "string" ? input.password : "";
		const user = username.length <= 32 ? queries.userByUsername.get(username) : null;
		const passwordValid = await passwordMatches(password, user || { password_salt: "00000000000000000000000000000000", password_hash: "00".repeat(PASSWORD_BYTES) });
		if (!user || !passwordValid) return sendJson(response, 401, { error: "The username or password is incorrect." });
		const token = randomBytes(32).toString("hex");
		const csrfToken = randomBytes(32).toString("hex");
		queries.insertSession.run(hashToken(token), user.id, csrfToken, Date.now() + SESSION_TTL_SECONDS * 1000);
		return sendJson(response, 200, { user: publicUser(user), csrfToken }, { "Set-Cookie": setSessionCookie(token) });
	}

	if (request.method === "POST" && url.pathname === "/api/auth/logout") {
		const session = currentSession(request);
		if (session && !requireCsrf(request, response, session)) return;
		if (!hasSameOrigin(request)) return sendJson(response, 403, { error: "Request origin was rejected." });
		if (session) queries.deleteSession.run(hashToken(session.token));
		return sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
	}

	if (url.pathname === "/api/admin/cashiers" && request.method === "GET") {
		if (!requireRole(request, response, "admin")) return;
		return sendJson(response, 200, { cashiers: queries.listCashiers.all() });
	}

	if (url.pathname === "/api/admin/cashiers" && request.method === "POST") {
		const session = requireRole(request, response, "admin");
		if (!session || !requireCsrf(request, response, session)) return;
		let input;
		try { input = await readJson(request); } catch (error) { return sendJson(response, 400, { error: error.message }); }
		const name = typeof input.name === "string" ? input.name.trim() : "";
		const username = typeof input.username === "string" ? input.username.trim() : "";
		const password = input.password;
		if (name.length < 2 || name.length > 80) return sendJson(response, 400, { error: "Enter a name between 2 and 80 characters." });
		if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return sendJson(response, 400, { error: "Username must be 3-32 letters, numbers, periods, underscores, or hyphens." });
		if (!validPassword(password)) return sendJson(response, 400, { error: "Password must be between 12 and 128 characters." });
		const salt = randomBytes(16);
		const hash = await scryptAsync(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
		try {
			const id = randomBytes(16).toString("hex");
			queries.insertUser.run(id, name, username, salt.toString("hex"), hash.toString("hex"), "cashier", new Date().toISOString());
			return sendJson(response, 201, { cashier: { id, name, username } });
		} catch (error) {
			if (String(error.message).includes("UNIQUE")) return sendJson(response, 409, { error: "That username is already in use." });
			throw error;
		}
	}

	const deleteMatch = url.pathname.match(/^\/api\/admin\/cashiers\/([a-f0-9]{32})$/);
	if (deleteMatch && request.method === "DELETE") {
		const session = requireRole(request, response, "admin");
		if (!session || !requireCsrf(request, response, session)) return;
		const result = queries.deleteCashier.run(deleteMatch[1]);
		if (!result.changes) return sendJson(response, 404, { error: "Cashier account not found." });
		return sendJson(response, 200, { ok: true });
	}

	return sendJson(response, 404, { error: "Not found." });
}

const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp"
};

function redirect(response, location) {
	response.writeHead(303, { Location: location, "Cache-Control": "no-store" });
	response.end();
}

function serveFile(response, filePath) {
	fs.readFile(filePath, (error, contents) => {
		if (error) {
			response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			return response.end("Not found");
		}
		const extension = path.extname(filePath).toLowerCase();
		const headers = {
			"Content-Type": contentTypes[extension] || "application/octet-stream",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
			"Referrer-Policy": "same-origin"
		};
		if (["/admin.html", "/cashier.html", "/login.html"].includes(new URL(response.req.url, "http://localhost").pathname)) headers["Cache-Control"] = "no-store";
		response.writeHead(200, headers);
		response.end(contents);
	});
}

const server = http.createServer(async (request, response) => {
	const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
	try {
		if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
		const session = currentSession(request);
		if (url.pathname === "/admin.html") {
			if (!session) return redirect(response, "/login.html?next=admin");
			if (session.user.role !== "admin") return redirect(response, "/cashier.html");
		}
		if (url.pathname === "/cashier.html") {
			if (!session) return redirect(response, "/login.html?next=cashier");
			if (session.user.role !== "cashier") return redirect(response, "/admin.html");
		}
		if (url.pathname === "/login.html" && session) return redirect(response, session.user.role === "admin" ? "/admin.html" : "/cashier.html");
		const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
		const normalizedPath = path.resolve(ROOT, relativePath);
		if (!normalizedPath.startsWith(`${ROOT}${path.sep}`)) {
			response.writeHead(403);
			return response.end("Forbidden");
		}
		if (!/^(?:index\.html|login\.html|admin\.html|cashier\.html|contact\.html|CSS\/[^/]+|Javascript\/[^/]+|assets\/[^/]+|HTML\/[^/]+)$/.test(relativePath)) {
			response.writeHead(404);
			return response.end("Not found");
		}
		response.req = request;
		serveFile(response, normalizedPath);
	} catch (error) {
		console.error(error);
		if (!response.headersSent) sendJson(response, 500, { error: "An unexpected server error occurred." });
		else response.destroy();
	}
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Cream2Go is running at http://localhost:${server.address().port}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		server.close(() => {
			db.close();
			process.exit(0);
		});
	});
}
