"use strict";

(() => {
	const state = { cart: [] };
	const elements = {
		root: document.documentElement,
		navigation: document.querySelector(".navbar__nav"),
		menuToggle: document.querySelector("[data-menu-toggle]"),
		cartCount: document.querySelector("[data-cart-count]"),
		cartButton: document.querySelector("[data-action='cart']"),
		toast: document.querySelector("[data-toast]"),
		currentYear: document.querySelector("[data-current-year]")
	};
	const trackForm = document.querySelector("[data-track-form]");
	const productSearch = document.querySelector("[data-product-search]");
	const searchClear = document.querySelector("[data-search-clear]");
	const searchStatus = document.querySelector("[data-search-status]");

	const getCartCount = () => state.cart.reduce((total, item) => total + item.quantity, 0);

	const renderCart = () => {
		const items = document.querySelector("[data-cart-items]");
		const total = document.querySelector("[data-cart-total]");
		const count = getCartCount();
		if (elements.cartCount) elements.cartCount.textContent = String(count);
		if (elements.cartButton) elements.cartButton.setAttribute("aria-label", `Open cart, ${count} item${count === 1 ? "" : "s"}`);
		if (total) total.textContent = `$${state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}`;
		if (!items) return;
		items.replaceChildren();
		if (!state.cart.length) {
			items.innerHTML = '<p class="cart-panel__empty">Your cart is empty.</p>';
			return;
		}
		state.cart.forEach((item) => {
			const row = document.createElement("div");
			row.className = "cart-item";
			row.innerHTML = `<div><strong>${item.name}</strong><span>$${item.price.toFixed(2)} each</span></div><div class="cart-item__controls"><button type="button" data-cart-change="-1" data-product="${item.name}" aria-label="Remove one ${item.name}">−</button><b>${item.quantity}</b><button type="button" data-cart-change="1" data-product="${item.name}" aria-label="Add one ${item.name}">+</button></div>`;
			items.append(row);
		});
	};

	const toggleCart = (isOpen) => {
		const panel = document.querySelector(".cart-panel");
		const backdrop = document.querySelector(".cart-backdrop");
		if (!panel || !backdrop) return;
		panel.classList.toggle("is-open", isOpen);
		backdrop.classList.toggle("is-visible", isOpen);
		panel.setAttribute("aria-hidden", String(!isOpen));
	};

	const showToast = (message) => {
		if (!elements.toast) return;
		elements.toast.textContent = message;
		elements.toast.classList.add("is-visible");
		window.clearTimeout(showToast.timeoutId);
		showToast.timeoutId = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
	};

	const addToCart = (target) => {
		const card = target.closest(".product-card");
		const item = { name: card?.dataset.product || "Cream2Go treat", price: Number(card?.dataset.price || 0) };
		const existing = state.cart.find((cartItem) => cartItem.name === item.name);
		if (existing) existing.quantity += 1;
		else state.cart.push({ ...item, quantity: 1 });
		renderCart();
		showToast(`${item.name} added to your cart.`);
	};

	const filterProducts = () => {
		const query = productSearch?.value.trim().toLowerCase() || "";
		const cards = [...document.querySelectorAll(".product-card")];
		const visibleCount = cards.reduce((count, card) => {
			const matches = !query || card.dataset.product.toLowerCase().includes(query);
			card.hidden = !matches;
			return count + Number(matches);
		}, 0);
		if (searchClear) searchClear.hidden = !query;
		if (searchStatus) searchStatus.textContent = query ? `${visibleCount} product${visibleCount === 1 ? "" : "s"} found for “${productSearch.value.trim()}”.` : "";
	};

	const trackOrder = (event) => {
		event.preventDefault();
		const input = trackForm?.querySelector("input");
		const message = document.querySelector("[data-track-message]");
		const result = document.querySelector("[data-track-result]");
		const orderId = input?.value.trim().toUpperCase();
		if (!orderId || orderId.length < 3) return;
		const steps = ["received", "preparing", "ready", "delivered"];
		const activeStep = orderId.endsWith("7") ? 2 : 1;
		document.querySelector("[data-track-id]").textContent = `#${orderId}`;
		document.querySelectorAll("[data-track-step]").forEach((step, index) => {
			step.classList.toggle("is-complete", index < activeStep);
			step.classList.toggle("is-current", index === activeStep);
		});
		const rider = document.querySelector("[data-track-rider]");
		if (rider) rider.classList.toggle("is-near-home", activeStep > 1);
		const eta = document.querySelector("[data-track-eta]");
		if (eta) eta.textContent = activeStep > 1 ? "Your order is on the move. Estimated arrival: 12 minutes." : "Your order is being prepared. Estimated arrival: 20 minutes.";
		if (message) message.textContent = `Tracking order #${orderId}`;
		result?.classList.add("is-active");
	};

	const toggleNavigation = () => {
		if (!elements.navigation || !elements.menuToggle) return;
		const isOpen = elements.navigation.classList.toggle("is-open");
		elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
	};

	const handleAction = (action, target) => {
		switch (action) {
			case "add-to-cart":
				addToCart(target);
				break;
			case "order":
				addToCart(document.querySelector(".product-card"));
				break;
			case "cart":
				toggleCart(true);
				break;
			case "checkout":
				showToast(state.cart.length ? "Checkout is ready for your order." : "Add an item before checking out.");
				break;
			case "favorite": {
				const isFavorite = target.getAttribute("aria-pressed") === "true";
				target.setAttribute("aria-pressed", String(!isFavorite));
				target.textContent = isFavorite ? "♡" : "♥";
				showToast(isFavorite ? "Removed from favorites." : "Saved to favorites.");
				break;
			}
			case "signin":
				showToast("Sign in is coming soon.");
				break;
			case "deals":
				showToast("Your Sazy Station deal is ready to use.");
				break;
			case "contact":
				showToast("Sazy Station contact details are coming soon.");
				break;
			default:
				break;
		}
	};

	const addRipple = (event, target) => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const ripple = document.createElement("span");
		const bounds = target.getBoundingClientRect();
		ripple.className = "ripple";
		ripple.style.left = `${event.clientX - bounds.left}px`;
		ripple.style.top = `${event.clientY - bounds.top}px`;
		target.style.position = "relative";
		target.style.overflow = "hidden";
		target.append(ripple);
		ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
	};

	document.addEventListener("click", (event) => {
		const quantityButton = event.target.closest("[data-cart-change]");
		if (quantityButton) {
			const item = state.cart.find((cartItem) => cartItem.name === quantityButton.dataset.product);
			if (item) item.quantity += Number(quantityButton.dataset.cartChange);
			state.cart = state.cart.filter((cartItem) => cartItem.quantity > 0);
			renderCart();
			return;
		}
		if (event.target.closest("[data-cart-close]")) {
			toggleCart(false);
			return;
		}
		const actionTarget = event.target.closest("[data-action]");
		if (actionTarget) {
			handleAction(actionTarget.dataset.action, actionTarget);
			addRipple(event, actionTarget);
		}

		if (event.target.closest("[data-menu-toggle]")) toggleNavigation();
		if (event.target.closest(".navbar__link") && elements.navigation?.classList.contains("is-open")) toggleNavigation();
	});

	trackForm?.addEventListener("submit", trackOrder);
	productSearch?.addEventListener("input", filterProducts);
	searchClear?.addEventListener("click", () => {
		if (!productSearch) return;
		productSearch.value = "";
		filterProducts();
		productSearch.focus();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			toggleCart(false);
			if (elements.navigation?.classList.contains("is-open")) toggleNavigation();
		}
	});

	renderCart();
	elements.currentYear?.replaceChildren(String(new Date().getFullYear()));
})();
