"use strict";

(() => {
	try { localStorage.removeItem("cream2go-cashiers"); } catch { /* Storage can be unavailable in private browsing. */ }
	const loginForm = document.querySelector("[data-login-form]");
	const loginMessage = document.querySelector("[data-login-message]");
	const passwordToggle = document.querySelector("[data-password-toggle]");
	const logoutButton = document.querySelector("[data-logout]");
	const cashierForm = document.querySelector("[data-cashier-form]");
	let csrfToken = null;

	const request = async (url, options = {}) => {
		const headers = new Headers(options.headers || {});
		if (options.body) headers.set("Content-Type", "application/json");
		if (csrfToken && options.method && options.method !== "GET") headers.set("X-CSRF-Token", csrfToken);
		const response = await fetch(url, { ...options, headers, credentials: "same-origin", cache: "no-store" });
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
		return payload;
	};

	const showLoginError = (message) => {
		if (loginMessage) loginMessage.textContent = message;
	};

	const destinationForRole = (role) => role === "admin" ? "/admin.html" : "/cashier.html";
	const cashierMessage = document.querySelector("[data-cashier-message]");
	const renderCashiers = (cashiers) => {
		const list = document.querySelector("[data-cashier-list]");
		const count = document.querySelector("[data-cashier-count]");
		if (!list) return;
		if (count) count.textContent = `${cashiers.length} account${cashiers.length === 1 ? "" : "s"}`;
		list.replaceChildren();
		if (!cashiers.length) {
			const empty = document.createElement("li");
			empty.className = "cashier-list__empty";
			empty.textContent = "No cashier accounts yet.";
			list.append(empty);
			return;
		}
		cashiers.forEach((cashier) => {
			const item = document.createElement("li");
			item.className = "cashier-list__item";
			const details = document.createElement("div");
			const name = document.createElement("strong");
			name.textContent = cashier.name;
			const username = document.createElement("span");
			username.textContent = `@${cashier.username}`;
			details.append(name, username);
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "cashier-remove";
			remove.dataset.deleteCashier = cashier.id;
			remove.setAttribute("aria-label", `Remove cashier ${cashier.name}`);
			remove.textContent = "Remove";
			item.append(details, remove);
			list.append(item);
		});
	};
	const refreshCashiers = async () => {
		const result = await request("/api/admin/cashiers");
		renderCashiers(result.cashiers);
	};

	passwordToggle?.addEventListener("click", () => {
		const passwordInput = document.querySelector("#login-password");
		if (!passwordInput) return;
		const showPassword = passwordInput.type === "password";
		passwordInput.type = showPassword ? "text" : "password";
		passwordToggle.textContent = showPassword ? "Hide" : "Show";
		passwordToggle.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
		passwordInput.focus();
	});

	loginForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const submitButton = loginForm.querySelector("[type='submit']");
		const formData = new FormData(loginForm);
		submitButton.disabled = true;
		submitButton.querySelector("span").textContent = "Signing in…";
		showLoginError("");
		try {
			const result = await request("/api/auth/login", {
				method: "POST",
				body: JSON.stringify({ username: formData.get("username"), password: formData.get("password") })
			});
			csrfToken = result.csrfToken;
			const requestedPage = new URLSearchParams(location.search).get("next");
			const requestedPath = requestedPage === "admin" && result.user.role === "admin" ? "/admin.html" : requestedPage === "cashier" && result.user.role === "cashier" ? "/cashier.html" : destinationForRole(result.user.role);
			location.assign(requestedPath);
		} catch (error) {
			showLoginError(error.message);
			submitButton.disabled = false;
			submitButton.querySelector("span").textContent = "Sign in";
		}
	});

	cashierForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		const submitButton = cashierForm.querySelector("[type='submit']");
		const data = new FormData(cashierForm);
		submitButton.disabled = true;
		if (cashierMessage) cashierMessage.textContent = "";
		try {
			const result = await request("/api/admin/cashiers", {
				method: "POST",
				body: JSON.stringify({ name: data.get("name"), username: data.get("username"), password: data.get("password") })
			});
			cashierForm.reset();
			await refreshCashiers();
			if (cashierMessage) cashierMessage.textContent = `Account for ${result.cashier.name} created. Give the cashier their password securely.`;
		} catch (error) {
			if (cashierMessage) cashierMessage.textContent = error.message;
		} finally {
			submitButton.disabled = false;
		}
	});

	document.addEventListener("click", async (event) => {
		const removeButton = event.target.closest("[data-delete-cashier]");
		if (!removeButton) return;
		removeButton.disabled = true;
		if (cashierMessage) cashierMessage.textContent = "";
		try {
			await request(`/api/admin/cashiers/${encodeURIComponent(removeButton.dataset.deleteCashier)}`, { method: "DELETE" });
			await refreshCashiers();
			if (cashierMessage) cashierMessage.textContent = "Cashier account removed.";
		} catch (error) {
			if (cashierMessage) cashierMessage.textContent = error.message;
			removeButton.disabled = false;
		}
	});

	logoutButton?.addEventListener("click", async () => {
		logoutButton.disabled = true;
		try {
			await request("/api/auth/logout", { method: "POST", body: "{}" });
		} finally {
			location.assign("/login.html");
		}
	});

	const initializePage = async () => {
		try {
			const result = await request("/api/auth/session");
			csrfToken = result.csrfToken;
			if (loginForm && result.user) {
				location.replace(destinationForRole(result.user.role));
				return;
			}
			const cashierPage = document.querySelector("[data-cashier-page]");
			if (cashierPage && (!result.user || result.user.role !== "cashier")) {
				location.replace(result.user ? destinationForRole(result.user.role) : "/login.html?next=cashier");
				return;
			}
			const userName = document.querySelector("[data-user-name]");
			if (userName && result.user) userName.textContent = result.user.name;
			if (cashierForm && result.user?.role === "admin") await refreshCashiers();
		} catch {
			if (loginMessage) showLoginError("The sign-in service is unavailable. Please try again shortly.");
			if (cashierMessage) cashierMessage.textContent = "The account service is unavailable. Refresh the page and try again.";
		}
	};

	initializePage();
})();
