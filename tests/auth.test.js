"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cream2go-auth-"));
const baseUrl = { value: "" };
let serverProcess;
let adminCookie;
let adminCsrf;
let cashierCookie;
let cashierCsrf;
let cashierId;

async function api(route, { method = "GET", cookie, csrf, body, redirect = "manual" } = {}) {
	const headers = {};
	if (cookie) headers.Cookie = cookie;
	if (csrf) headers["X-CSRF-Token"] = csrf;
	if (body) headers["Content-Type"] = "application/json";
	return fetch(`${baseUrl.value}${route}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		redirect
	});
}

async function login(username, password) {
	const response = await api("/api/auth/login", { method: "POST", body: { username, password } });
	const payload = await response.json();
	return { response, payload, cookie: response.headers.getSetCookie()[0]?.split(";")[0] };
}

before(async () => {
	serverProcess = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
		cwd: path.join(__dirname, ".."),
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			ADMIN_USERNAME: "test-admin",
			ADMIN_PASSWORD: "test-admin-password-48",
			CONTACT_EMAIL: "contact@example.test",
			DATABASE_PATH: path.join(temporaryDirectory, "test.sqlite"),
			PORT: "0"
		}
	});
	let output = "";
	serverProcess.stdout.setEncoding("utf8");
	serverProcess.stdout.on("data", (chunk) => { output += chunk; });
	serverProcess.stderr.setEncoding("utf8");
	serverProcess.stderr.on("data", (chunk) => { output += chunk; });
	const startedAt = Date.now();
	while (!output.includes("Cream2Go is running at http://localhost:")) {
		if (serverProcess.exitCode !== null) throw new Error(`Test server exited early: ${output}`);
		if (Date.now() - startedAt > 10000) throw new Error(`Test server did not start: ${output}`);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	const match = output.match(/http:\/\/localhost:(\d+)/);
	baseUrl.value = `http://127.0.0.1:${match[1]}`;
});

after(async () => {
	if (serverProcess && serverProcess.exitCode === null) {
		serverProcess.kill("SIGTERM");
		await once(serverProcess, "exit");
	}
	fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("protects admin and cashier pages from anonymous visitors", async () => {
	const adminPage = await api("/admin.html");
	assert.equal(adminPage.status, 303);
	assert.equal(adminPage.headers.get("location"), "/login.html?next=admin");
	const cashierApi = await api("/api/admin/cashiers");
	assert.equal(cashierApi.status, 401);
});

test("serves the contact page and configured business email", async () => {
	const contactPage = await api("/contact.html");
	assert.equal(contactPage.status, 200);
	assert.match(await contactPage.text(), /data-contact-form/);
	const config = await api("/api/contact/config");
	assert.equal(config.status, 200);
	assert.deepEqual(await config.json(), { email: "contact@example.test" });
});

test("authenticates the administrator and creates hashed cashier accounts", async () => {
	const invalid = await login("test-admin", "wrong-password-123");
	assert.equal(invalid.response.status, 401);
	const signedIn = await login("TEST-ADMIN", "test-admin-password-48");
	assert.equal(signedIn.response.status, 200);
	assert.equal(signedIn.payload.user.role, "admin");
	assert.match(signedIn.response.headers.get("set-cookie"), /HttpOnly/);
	assert.match(signedIn.response.headers.get("set-cookie"), /SameSite=Strict/);
	assert.ok(!JSON.stringify(signedIn.payload).includes("test-admin-password-48"));
	adminCookie = signedIn.cookie;
	adminCsrf = signedIn.payload.csrfToken;

	const noCsrf = await api("/api/admin/cashiers", {
		method: "POST", cookie: adminCookie,
		body: { name: "Casey Cashier", username: "casey.cashier", password: "cashier-strong-password-48" }
	});
	assert.equal(noCsrf.status, 403);

	const created = await api("/api/admin/cashiers", {
		method: "POST", cookie: adminCookie, csrf: adminCsrf,
		body: { name: "Casey Cashier", username: "casey.cashier", password: "cashier-strong-password-48" }
	});
	assert.equal(created.status, 201);
	const cashier = (await created.json()).cashier;
	cashierId = cashier.id;
	assert.equal(cashier.username, "casey.cashier");
	assert.ok(!JSON.stringify(cashier).includes("cashier-strong-password-48"));

	const duplicate = await api("/api/admin/cashiers", {
		method: "POST", cookie: adminCookie, csrf: adminCsrf,
		body: { name: "Duplicate Cashier", username: "CASEY.CASHIER", password: "another-strong-password-49" }
	});
	assert.equal(duplicate.status, 409);

	const invalidPassword = await api("/api/admin/cashiers", {
		method: "POST", cookie: adminCookie, csrf: adminCsrf,
		body: { name: "Weak Password", username: "weak.password", password: "short" }
	});
	assert.equal(invalidPassword.status, 400);
});

test("enforces cashier role boundaries and allows administrator removal", async () => {
	const signedIn = await login("casey.cashier", "cashier-strong-password-48");
	assert.equal(signedIn.response.status, 200);
	assert.equal(signedIn.payload.user.role, "cashier");
	cashierCookie = signedIn.cookie;
	cashierCsrf = signedIn.payload.csrfToken;

	const cashierPage = await api("/cashier.html", { cookie: cashierCookie });
	assert.equal(cashierPage.status, 200);
	const forbiddenList = await api("/api/admin/cashiers", { cookie: cashierCookie });
	assert.equal(forbiddenList.status, 403);
	const forbiddenDelete = await api(`/api/admin/cashiers/${cashierId}`, {
		method: "DELETE", cookie: cashierCookie, csrf: cashierCsrf
	});
	assert.equal(forbiddenDelete.status, 403);
	const wrongPage = await api("/admin.html", { cookie: cashierCookie });
	assert.equal(wrongPage.status, 303);
	assert.equal(wrongPage.headers.get("location"), "/cashier.html");

	const removed = await api(`/api/admin/cashiers/${cashierId}`, {
		method: "DELETE", cookie: adminCookie, csrf: adminCsrf
	});
	assert.equal(removed.status, 200);
	const cashierNoLongerAuthenticates = await login("casey.cashier", "cashier-strong-password-48");
	assert.equal(cashierNoLongerAuthenticates.response.status, 401);
});
