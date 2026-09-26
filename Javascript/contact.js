"use strict";

(() => {
	const form = document.querySelector("[data-contact-form]");
	const status = document.querySelector("[data-contact-status]");
	let contactEmail = "";

	fetch("/api/contact/config", { cache: "no-store" })
		.then((response) => response.ok ? response.json() : null)
		.then((config) => {
			contactEmail = config?.email || "";
			if (form && !contactEmail && status) {
				status.textContent = "Message delivery is not configured yet. Please use the order links or contact the site administrator.";
			}
		})
		.catch(() => {
			if (status) status.textContent = "Could not load contact settings. Please refresh and try again.";
		});

	form?.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!contactEmail) {
			if (status) status.textContent = "Message delivery is not configured yet. Please use the order links or contact the site administrator.";
			return;
		}
		const data = new FormData(form);
		const subject = `[${data.get("topic")}] Message from ${data.get("name")}`;
		const body = [
			`Name: ${data.get("name")}`,
			`Email: ${data.get("email")}`,
			`Topic: ${data.get("topic")}`,
			`Order number: ${data.get("order") || "Not provided"}`,
			"",
			String(data.get("message"))
		].join("\n");
		window.location.href = `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
		if (status) status.textContent = "Your email draft is ready. Review it and send it from your email app.";
	});
})();
