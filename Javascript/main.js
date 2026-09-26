"use strict";

(() => {
	try { localStorage.removeItem("cream2go-cashiers"); } catch { /* Storage can be unavailable in private browsing. */ }
	const ORDERS_KEY = "cream2go-orders";
	const CART_KEY = "cream2go-cart";
	const FAVORITES_KEY = "cream2go-favorites";
	const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
	const writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));
	const state = { cart: readStore(CART_KEY, []), favorites: new Set(readStore(FAVORITES_KEY, [])) };
	const elements = { navigation: document.querySelector(".navbar__nav"), menuToggle: document.querySelector("[data-menu-toggle]"), cartCount: document.querySelector("[data-cart-count]"), cartButton: document.querySelector("[data-action='cart']"), toast: document.querySelector("[data-toast]"), currentYear: document.querySelector("[data-current-year]") };
	const trackForm = document.querySelector("[data-track-form]");
	const productSearch = document.querySelector("[data-product-search]");
	const searchClear = document.querySelector("[data-search-clear]");
	const searchStatus = document.querySelector("[data-search-status]");
	const money = (value) => `$${Number(value).toFixed(2)}`;
	const getOrders = () => readStore(ORDERS_KEY, []);
	const getCartTotal = () => state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
	const getCartCount = () => state.cart.reduce((total, item) => total + item.quantity, 0);
	const saveFavorites = () => writeStore(FAVORITES_KEY, [...state.favorites]);
	const initializeFavorites = () => {
		document.querySelectorAll("[data-action='favorite']").forEach((button) => {
			const product = button.closest(".product-card")?.dataset.product;
			const active = Boolean(product && state.favorites.has(product));
			button.setAttribute("aria-pressed", String(active));
			button.textContent = active ? "♥" : "♡";
		});
	};
	const normalizeIcons = () => {
		const iconMap = {
			"Gîé": 8962, "Gôÿ": 8505, "=ƒìª": 127846, "G¢+": 9981, "=ƒÜÜ": 128666, "=ƒÅ+": 9881,
			"=ƒæñ": 128100, "=ƒ¢Æ": 128722, "=ƒ¢¦": 128666, "=ƒôì": 128205, "=ƒÜù": 128757, "Gÿ¦": 9776,
			"Gÿà": 9733, "=ƒì¿": 127846, "=ƒÄü": 127881, "=ƒöÑ": 127775, "=ƒì½": 127851,
			"G£¿": 127827, "G£ª": 10024, "GÜí": 9749, "GÖí": 9829, "=ƒÑñ": 129371, "=ƒìö": 127828, "=ƒÑÉ": 127831,
			"=ƒÑƒ": 129388, "=ƒìò": 127829, "=ƒì¥": 127837, "=ƒìù": 127831, "=ƒÜ¢": 128167,
			"+ù": 10005, "Gùë": 128167, "G¥ä": 10024, "GÅ¦": 9201, "Gÿä": 9733,
			"GÇó": 8226, "GÇö": 8212, "GÇÖ": 8217, "GÇí": 8211,
			"Gûú": 128666, "GÜÖ": 9881, "Gîò": 128269, "GåÆ": 10132, "Gåù": 10132
		};
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		const nodes = [];
		while (walker.nextNode()) nodes.push(walker.currentNode);
		nodes.forEach((node) => {
			let text = node.nodeValue;
			Object.entries(iconMap).forEach(([token, codePoint]) => {
				if (typeof codePoint === "number") text = text.replaceAll(token, String.fromCodePoint(codePoint));
			});
			if (/[G=][^\s<]{1,5}/.test(text) && node.parentElement?.getAttribute("aria-hidden") === "true") text = "•";
			node.nodeValue = text;
		});
	};

	const showToast = (message) => {
		if (!elements.toast) return;
		elements.toast.textContent = message;
		elements.toast.classList.add("is-visible");
		window.clearTimeout(showToast.timeoutId);
		showToast.timeoutId = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
	};
	const renderCart = () => {
		const items = document.querySelector("[data-cart-items]");
		const total = document.querySelector("[data-cart-total]");
		const count = getCartCount();
		if (elements.cartCount) elements.cartCount.textContent = String(count);
		if (elements.cartButton) elements.cartButton.setAttribute("aria-label", `Open cart, ${count} item${count === 1 ? "" : "s"}`);
		if (total) total.textContent = money(getCartTotal());
		const checkoutTotal = document.querySelector("[data-checkout-total]");
		if (checkoutTotal) checkoutTotal.textContent = money(getCartTotal());
		if (!items) return;
		items.replaceChildren();
		if (!state.cart.length) { items.innerHTML = '<p class="cart-panel__empty">Your cart is empty.</p>'; return; }
		state.cart.forEach((item) => { const row = document.createElement("div"); row.className = "cart-item"; row.innerHTML = `<div><strong>${item.name}</strong><span>${money(item.price)} each</span></div><div class="cart-item__controls"><button type="button" data-cart-change="-1" data-product="${item.name}" aria-label="Remove one ${item.name}">-</button><b>${item.quantity}</b><button type="button" data-cart-change="1" data-product="${item.name}" aria-label="Add one ${item.name}">+</button></div>`; items.append(row); });
		writeStore(CART_KEY, state.cart);
	};
	const toggleCart = (isOpen) => { const panel = document.querySelector(".cart-panel"); const backdrop = document.querySelector(".cart-backdrop"); if (!panel || !backdrop) return; panel.classList.toggle("is-open", isOpen); backdrop.classList.toggle("is-visible", isOpen); panel.setAttribute("aria-hidden", String(!isOpen)); };
	const toggleCheckout = (isOpen) => { const panel = document.querySelector("[data-checkout-panel]"); const backdrop = document.querySelector(".checkout-backdrop"); if (!panel || !backdrop) return; panel.classList.toggle("is-open", isOpen); backdrop.classList.toggle("is-visible", isOpen); panel.setAttribute("aria-hidden", String(!isOpen)); renderCart(); };
	const addToCart = (target) => { const card = target?.closest(".product-card"); const item = { name: card?.dataset.product || "Cream2Go treat", price: Number(card?.dataset.price || 0) }; const existing = state.cart.find((cartItem) => cartItem.name === item.name); if (existing) existing.quantity += 1; else state.cart.push({ ...item, quantity: 1 }); renderCart(); showToast(`${item.name} added to your cart.`); };
	const filterProducts = () => { const query = productSearch?.value.trim().toLowerCase() || ""; const cards = [...document.querySelectorAll(".product-card")]; const visibleCount = cards.reduce((count, card) => { const matches = !query || card.dataset.product.toLowerCase().includes(query); card.hidden = !matches; return count + Number(matches); }, 0); if (searchClear) searchClear.hidden = !query; if (searchStatus) searchStatus.textContent = query ? `${visibleCount} product${visibleCount === 1 ? "" : "s"} found for "${productSearch.value.trim()}".` : ""; };

	const trackOrder = (event) => {
		event.preventDefault();
		const orderId = trackForm?.querySelector("input")?.value.trim().toUpperCase();
		if (!orderId || orderId.length < 3) return;
		const order = getOrders().find((item) => item.id.toUpperCase() === orderId);
		const message = document.querySelector("[data-track-message]"); const result = document.querySelector("[data-track-result]");
		if (!order) { if (message) message.textContent = "We could not find that order. Check the number and try again."; return; }
		const statusIndex = { received: 0, preparing: 1, ready: 2, delivered: 3 }[order.status] ?? 0;
		document.querySelector("[data-track-id]").textContent = `#${order.id}`;
		document.querySelectorAll("[data-track-step]").forEach((step, index) => { step.classList.toggle("is-complete", index < statusIndex); step.classList.toggle("is-current", index === statusIndex); });
		if (message) message.textContent = `Tracking order #${order.id} for ${order.customer.name}`;
		const eta = document.querySelector("[data-track-eta]"); if (eta) eta.textContent = order.status === "delivered" ? "Your order has been delivered. Enjoy!" : `Your order is ${order.status}. Estimated arrival: ${order.status === "preparing" ? "20" : "12"} minutes.`;
		result?.classList.add("is-active");
	};
	const submitCheckout = (event) => {
		event.preventDefault();
		if (!state.cart.length) { showToast("Add an item before checking out."); toggleCheckout(false); return; }
		const form = event.currentTarget; const data = new FormData(form);
		const order = { id: `C2G${Date.now().toString().slice(-6)}`, customer: { name: data.get("name"), email: data.get("email"), phone: data.get("phone"), address: data.get("address") }, payment: data.get("payment"), items: state.cart.map((item) => ({ ...item })), total: getCartTotal(), status: "received", createdAt: new Date().toISOString() };
		writeStore(ORDERS_KEY, [order, ...getOrders()]); state.cart = []; writeStore(CART_KEY, state.cart); renderCart(); form.reset(); toggleCheckout(false); toggleCart(false); showToast(`Order #${order.id} placed. Track it from the Track Order section.`);
	};

	const renderAdmin = () => {
		const orders = getOrders(); const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0); const active = orders.filter((order) => order.status !== "delivered").length; const pending = orders.filter((order) => order.status === "received").length;
		const setText = (selector, value) => { const node = document.querySelector(selector); if (node) node.textContent = value; };
		setText("[data-admin-orders]", orders.length); setText("[data-admin-revenue]", money(revenue)); setText("[data-admin-active]", active); setText("[data-admin-pending]", pending); setText("[data-admin-date]", new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }));
		const table = document.querySelector("[data-admin-orders-table]");
		if (table) { table.replaceChildren(); orders.slice(0, 12).forEach((order) => { const row = document.createElement("tr"); const items = order.items.map((item) => `${item.name} x${item.quantity}`).join(", "); row.innerHTML = `<td data-label="Order ID">#${order.id}</td><td data-label="Customer">${order.customer.name}</td><td data-label="Items">${items}</td><td data-label="Status"><span class="status status--${order.status === "delivered" ? "done" : "inprogress"}">${order.status}</span></td><td data-label="Total">${money(order.total)}</td><td data-label="Time">${new Date(order.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>`; table.append(row); }); if (!orders.length) table.innerHTML = '<tr><td colspan="6" class="admin-empty">No orders yet. Customer orders will appear here.</td></tr>'; }
		const counts = {}; orders.forEach((order) => order.items.forEach((item) => { counts[item.name] = (counts[item.name] || 0) + item.quantity; }));
		const products = document.querySelector("[data-admin-products]"); if (products) { products.replaceChildren(); Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([name, count], index) => { const item = document.createElement("li"); item.innerHTML = `<span class="dot dot--${["red", "green", "amber"][index % 3]}"></span><div><strong>${name}</strong><small>${count} sold</small></div><em>${Math.round((count / (orders.reduce((sum, order) => sum + order.items.reduce((total, product) => total + product.quantity, 0), 0) || 1)) * 100)}%</em>`; products.append(item); }); if (!Object.keys(counts).length) products.innerHTML = '<li class="admin-empty">Sales will appear after the first order.</li>'; }
		const chart = document.querySelector("[data-admin-chart]"); const labels = document.querySelector("[data-admin-chart-labels]"); if (chart && labels) { chart.replaceChildren(); labels.replaceChildren(); const days = [...Array(7)].map((_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return date; }); const values = days.map((date) => orders.filter((order) => new Date(order.createdAt).toDateString() === date.toDateString()).reduce((sum, order) => sum + Number(order.total || 0), 0)); const max = Math.max(...values, 1); values.forEach((value, index) => { const bar = document.createElement("div"); bar.className = `chart-bar chart-bar--${index + 1}`; bar.style.setProperty("--value", `${Math.max(value / max * 100, value ? 10 : 4)}%`); bar.title = money(value); chart.append(bar); }); days.forEach((date) => { const label = document.createElement("span"); label.textContent = date.toLocaleDateString([], { weekday: "short" }); labels.append(label); }); }
	};
	const handleAction = (action, target) => { switch (action) { case "add-to-cart": addToCart(target); break; case "order": addToCart(document.querySelector(".product-card")); break; case "cart": toggleCart(true); break; case "checkout": if (state.cart.length) toggleCheckout(true); else showToast("Add an item before checking out."); break; case "signin": window.location.assign("/login.html"); break; case "favorite": { const product = target.closest(".product-card")?.dataset.product; const active = target.getAttribute("aria-pressed") === "true"; if (product) { if (active) state.favorites.delete(product); else state.favorites.add(product); saveFavorites(); } target.setAttribute("aria-pressed", String(!active)); target.textContent = active ? "♡" : "♥"; showToast(active ? "Removed from saved treats." : "Saved to your favorites."); break; } default: showToast("This feature is ready for the next store update."); } };
	document.addEventListener("click", (event) => { const quantityButton = event.target.closest("[data-cart-change]"); if (quantityButton) { const item = state.cart.find((cartItem) => cartItem.name === quantityButton.dataset.product); if (item) item.quantity += Number(quantityButton.dataset.cartChange); state.cart = state.cart.filter((item) => item.quantity > 0); renderCart(); return; } if (event.target.closest("[data-cart-close]")) { toggleCart(false); return; } if (event.target.closest("[data-checkout-close]")) { toggleCheckout(false); return; } const actionTarget = event.target.closest("[data-action]"); if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget); if (event.target.closest("[data-menu-toggle]")) { const open = elements.navigation?.classList.toggle("is-open"); elements.menuToggle?.setAttribute("aria-expanded", String(open)); } });
	trackForm?.addEventListener("submit", trackOrder); document.querySelector("[data-checkout-form]")?.addEventListener("submit", submitCheckout); productSearch?.addEventListener("input", filterProducts); searchClear?.addEventListener("click", () => { if (productSearch) { productSearch.value = ""; filterProducts(); productSearch.focus(); } });
	document.addEventListener("keydown", (event) => { if (event.key === "Escape") { toggleCart(false); toggleCheckout(false); } });
	normalizeIcons(); initializeFavorites(); renderCart(); renderAdmin(); elements.currentYear?.replaceChildren(String(new Date().getFullYear()));
})();
