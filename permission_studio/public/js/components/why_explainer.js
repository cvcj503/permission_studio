import { esc } from "../utils/helpers";

export class WhyExplainer {
	constructor(opts) {
		this.user = opts.user;
		this.doctype = opts.doctype;
		this.ptype = opts.ptype || "read";
		this.show();
	}

	show() {
		this.dialog = new frappe.ui.Dialog({
			title: __("Permission Explainer"),
			size: "large",
			fields: [
				{ fieldtype: "HTML", fieldname: "header_html" },
				{
					fieldtype: "Select",
					fieldname: "ptype",
					label: __("Permission Type"),
					options: [
						"select", "read", "write", "create", "delete",
						"submit", "cancel", "amend",
						"print", "email", "report",
						"import", "export", "share",
					].join("\n"),
					default: this.ptype,
					change: () => this.load_explanation(),
				},
				{ fieldtype: "HTML", fieldname: "steps_html" },
			],
		});

		this.dialog.fields_dict.header_html.$wrapper.html(`
			<div class="ps-why-header">
				<strong>${__("User")}:</strong> ${esc(this.user)}<br>
				<strong>${__("DocType")}:</strong> ${esc(this.doctype)}
			</div>
		`);

		this.dialog.show();
		this.load_explanation();
	}

	load_explanation() {
		const ptype = this.dialog.get_value("ptype") || this.ptype;
		const $container = this.dialog.fields_dict.steps_html.$wrapper;
		$container.html(this._skeleton_html(3));

		frappe.call({
			method: "permission_studio.api.resolver.explain_permission",
			args: { user: this.user, doctype: this.doctype, ptype },
			callback: (r) => {
				if (r.message) this._render_steps($container, r.message);
			},
			error: () => {
				$container.html(`
					<div class="ps-error-state">
						<div class="ps-error-icon">${frappe.utils.icon("error", "lg")}</div>
						<div class="ps-error-msg">${__("Failed to analyze permissions. Please try again.")}</div>
						<button class="btn btn-sm btn-default ps-why-retry">
							${frappe.utils.icon("refresh", "xs")} ${__("Retry")}
						</button>
					</div>
				`);
				$container.find(".ps-why-retry").on("click", () => this.load_explanation());
			},
		});
	}

	_skeleton_html(count) {
		let rows = "";
		for (let i = 0; i < count; i++) {
			rows += `
				<div class="ps-skeleton-row">
					<div class="ps-skeleton-cell ps-skel-label"></div>
					<div class="ps-skeleton-cell ps-skel-wide"></div>
					<div class="ps-skeleton-cell ps-skel-sm"></div>
				</div>`;
		}
		return `<div class="ps-loading">${rows}</div>`;
	}

	_render_steps($container, data) {
		const status_icons = { pass: "\u2705", fail: "\u274C", warn: "\u26A0\uFE0F", info: "\u2139\uFE0F" };
		const status_classes = { pass: "ps-step-pass", fail: "ps-step-fail", warn: "ps-step-warn", info: "ps-step-info" };

		const result_class =
			data.result === "allow" ? "ps-result-allow" :
			data.result === "cond" ? "ps-result-cond" : "ps-result-deny";

		let html = `
			<div class="ps-result-banner ${result_class}">
				<strong>${data.result === "allow" ? __("ALLOWED") : data.result === "cond" ? __("CONDITIONAL") : __("DENIED")}</strong>
				<span>${esc(data.result_reason)}</span>
			</div>
			<div class="ps-steps">
		`;

		data.steps.forEach((step) => {
			const icon = status_icons[step.status] || "\u2139\uFE0F";
			const cls = status_classes[step.status] || "";

			html += `
				<div class="ps-step ${cls}">
					<div class="ps-step-header">
						<span class="ps-step-icon">${icon}</span>
						<span class="ps-step-num">${__("Step")} ${step.step}</span>
						<span class="ps-step-title">${esc(step.title)}</span>
					</div>
					<div class="ps-step-body">
						<p>${esc(step.description)}</p>
			`;

			if (step.details && step.details.length) {
				html += `<ul class="ps-step-details">`;
				step.details.forEach((d) => { html += `<li>${esc(d)}</li>`; });
				html += `</ul>`;
			}

			html += `</div></div>`;
		});

		html += `</div>`;
		$container.html(html);
	}
}
