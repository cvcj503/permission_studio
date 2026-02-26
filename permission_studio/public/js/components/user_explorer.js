import { esc } from "../utils/helpers";

export class UserExplorer {
	constructor(opts) {
		this.user = opts.user;
		this.load();
	}

	load() {
		Promise.all([
			new Promise((resolve) => {
				frappe.call({
					method: "permission_studio.api.restrictions.get_user_restrictions",
					args: { user: this.user },
					callback: (r) => resolve(r.message),
				});
			}),
			new Promise((resolve) => {
				frappe.call({
					method: "permission_studio.api.restrictions.get_user_shares",
					args: { user: this.user },
					callback: (r) => resolve(r.message),
				});
			}),
		]).then(([restrictions, shares]) => {
			this.render(restrictions, shares);
		}).catch(() => {
			frappe.msgprint({
				title: __("Error"),
				indicator: "red",
				message: __("Failed to load restrictions and shares. Please try again."),
			});
		});
	}

	render(restrictions_data, shares_data) {
		const dialog = new frappe.ui.Dialog({
			title: __("Restrictions & Shares: {0}", [this.user]),
			size: "extra-large",
			fields: [{ fieldtype: "HTML", fieldname: "content_html" }],
		});

		const $container = dialog.fields_dict.content_html.$wrapper;
		let html = `<div class="ps-explorer">`;

		// Restrictions
		html += `<h4 class="ps-section-title">${__("User Permission Restrictions")}</h4>`;

		if (!restrictions_data.restrictions.length) {
			html += `<div class="ps-empty-state">${__("No restrictions — full role-based access.")}</div>`;
		} else {
			// Summary badges
			html += `<div class="ps-restriction-summary">`;
			for (const [dt, values] of Object.entries(restrictions_data.restriction_summary)) {
				html += `<div class="ps-restriction-badge">
					<strong>${esc(dt)}:</strong>
					${values.map((v) => `<span class="ps-badge">${esc(v)}</span>`).join(" ")}
				</div>`;
			}
			html += `</div>`;

			// Cards
			html += `<div class="ps-restriction-cards">`;
			restrictions_data.restrictions.forEach((r) => {
				html += `
					<div class="ps-card">
						<div class="ps-card-header">
							<strong>${esc(r.allow)}</strong> =
							<span class="ps-badge">${esc(r.for_value)}</span>
							${r.is_default ? `<span class="ps-badge ps-badge-default">${__("Default")}</span>` : ""}
						</div>
						<div class="ps-card-body">
							<div class="ps-card-detail">
								<strong>${__("Applied to")}:</strong>
								${r.apply_to_all ? __("All DocTypes with link to {0}", [r.allow]) : esc(r.applicable_for || "All")}
							</div>
							<div class="ps-card-detail">
								<strong>${__("Affected DocTypes")} (${r.affected_doctypes.length}):</strong>
								<div class="ps-affected-list">
									${r.affected_doctypes.slice(0, 15).map((dt) => `<span class="ps-mini-badge">${esc(dt)}</span>`).join(" ")}
									${r.affected_doctypes.length > 15 ? `<span class="ps-mini-badge">+${r.affected_doctypes.length - 15} more</span>` : ""}
								</div>
							</div>
						</div>
					</div>
				`;
			});
			html += `</div>`;
		}

		// Shares
		html += `<h4 class="ps-section-title">${__("Shared Documents")}</h4>`;

		if (!shares_data.shares.length) {
			html += `<div class="ps-empty-state">${__("No documents shared with this user.")}</div>`;
		} else {
			html += `<table class="ps-shares-table">
				<thead><tr>
					<th>${__("DocType")}</th><th>${__("Document")}</th>
					<th>${__("Read")}</th><th>${__("Write")}</th>
					<th>${__("Share")}</th><th>${__("Shared By")}</th>
				</tr></thead><tbody>`;

			shares_data.shares.forEach((s) => {
				html += `<tr>
					<td>${esc(s.doctype)}</td>
					<td><a href="/app/${frappe.router.slug(s.doctype)}/${s.docname}">${esc(s.docname)}</a></td>
					<td>${s.read ? "\u2713" : "\u2717"}</td>
					<td>${s.write ? "\u2713" : "\u2717"}</td>
					<td>${s.share ? "\u2713" : "\u2717"}</td>
					<td>${esc(s.owner)}</td>
				</tr>`;
			});
			html += `</tbody></table>`;
		}

		html += `</div>`;
		$container.html(html);
		dialog.show();
	}
}
