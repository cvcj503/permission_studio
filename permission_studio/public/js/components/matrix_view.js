import { MATRIX_RIGHTS, RIGHT_LABELS, RIGHT_FULL_LABELS, PERM_ICONS, esc } from "../utils/helpers";

export class MatrixView {
	constructor(opts) {
		this.wrapper = opts.wrapper;
		this.data = opts.data;
		this.mode = opts.mode; // "user" | "doctype"
		this.on_why_click = opts.on_why_click;
		this.on_restrictions_click = opts.on_restrictions_click;
		this.render();
	}

	render() {
		this.wrapper.empty();
		if (this.mode === "user") {
			this._render_user_header();
			this._render_user_matrix();
		} else {
			this._render_doctype_header();
			this._render_doctype_matrix();
		}
	}

	_render_user_header() {
		const d = this.data;
		const roles_html = d.roles
			.map((r) => `<span class="ps-badge">${esc(r)}</span>`)
			.join(" ");

		const full_name = frappe.db && d.user ? "" : "";

		const $header = $(`
			<div class="ps-matrix-header">
				<div class="ps-user-info">
					<div class="ps-user-details">
						<h3>${esc(d.user)}</h3>
						<div class="ps-roles-list">
							<span class="ps-badge ps-badge-all ${!this._active_role ? 'active' : ''}" data-role="">All</span>
							${roles_html}
						</div>
						${d.role_profile ? `<div class="ps-role-profile">${__("Role Profile")}: <strong>${esc(d.role_profile)}</strong></div>` : ""}
						<div class="ps-stats">${__("Showing {0} DocTypes", [d.total_doctypes])}</div>
					</div>
				</div>
				<div class="ps-header-actions">
					<button class="btn btn-xs btn-default ps-restrictions-btn">
						${frappe.utils.icon("lock", "xs")} ${__("View Restrictions")}
					</button>
				</div>
			</div>
		`);

		$header.find(".ps-restrictions-btn").on("click", () => {
			if (this.on_restrictions_click) this.on_restrictions_click();
		});

		this.wrapper.append($header);
	}

	_render_user_matrix() {
		const d = this.data;

		if (!d.matrix || !d.matrix.length) {
			this.wrapper.append($(`<div class="ps-empty-state">${__("No permissions found for this user. They may have no roles assigned or no DocTypes match the current filter.")}</div>`));
			return;
		}

		// Hint above table
		const $hint = $(`<div class="ps-table-hint">${__("Click any permission cell to understand why it is allowed or denied")}</div>`);
		this.wrapper.append($hint);

		let html = `<div class="ps-matrix-scroll"><table class="ps-matrix-table">`;

		// Header (no Why? column)
		html += `<thead><tr>
			<th class="ps-col-module">${__("MODULE")}</th>
			<th class="ps-col-doctype">${__("DOCTYPE")}</th>`;
		MATRIX_RIGHTS.forEach((r) => {
			html += `<th class="ps-col-perm" title="${RIGHT_FULL_LABELS[r] || r}">${RIGHT_LABELS[r]}</th>`;
		});
		html += `</tr></thead>`;

		// Body
		html += `<tbody>`;
		let last_module = "";

		d.matrix.forEach((row) => {
			const show_module = row.module !== last_module;
			last_module = row.module;

			html += `<tr class="ps-matrix-row" data-doctype="${esc(row.doctype)}">`;
			html += `<td class="ps-col-module">${show_module ? esc(row.module) : ""}</td>`;
			html += `<td class="ps-col-doctype">
				<a href="/app/${frappe.router.slug(row.doctype)}" target="_blank">${esc(row.doctype)}</a>
			</td>`;

			MATRIX_RIGHTS.forEach((r) => {
				const val = row.permissions[r];
				const status_label = val === "allow" ? "Allowed" : val === "deny" ? "Denied" : val === "cond" ? "Conditional" : "N/A";
				const clickable = this.on_why_click ? "ps-cell-clickable" : "";
				html += `<td class="ps-cell ps-cell-${val} ${clickable}"
					title="${RIGHT_FULL_LABELS[r] || r}: ${status_label} — Click to explain"
					data-doctype="${esc(row.doctype)}" data-ptype="${r}">${PERM_ICONS[val]}</td>`;
			});

			html += `</tr>`;
		});

		html += `</tbody></table></div>`;

		const $table = $(html);

		// Click on any permission cell to explain
		$table.find(".ps-cell-clickable").on("click", (e) => {
			const $cell = $(e.currentTarget);
			const doctype = $cell.data("doctype");
			const ptype = $cell.data("ptype");
			if (this.on_why_click) this.on_why_click(doctype, ptype);
		});

		this.wrapper.append($table);
	}

	_render_doctype_header() {
		const d = this.data;
		this.wrapper.append($(`
			<div class="ps-matrix-header">
				<div class="ps-doctype-info">
					<h3>${esc(d.doctype)}</h3>
					<div class="ps-stats">
						${__("Module")}: ${esc(d.module)} |
						${d.is_submittable ? __("Submittable") : __("Not Submittable")} |
						${d.is_custom
							? `<span class="ps-badge ps-badge-custom">${__("Custom Perms Active")}</span>`
							: `<span class="ps-badge">${__("Standard Perms")}</span>`}
					</div>
				</div>
			</div>
		`));
	}

	_render_doctype_matrix() {
		const d = this.data;

		if (!d.roles || !d.roles.length) {
			this.wrapper.append($(`<div class="ps-empty-state">${__("No role permissions defined for this DocType.")}</div>`));
			return;
		}

		let html = `<div class="ps-matrix-scroll"><table class="ps-matrix-table">`;

		html += `<thead><tr>
			<th class="ps-col-role">${__("Role")}</th>
			<th class="ps-col-level">${__("Level")}</th>
			<th class="ps-col-owner">${__("If Owner")}</th>`;
		MATRIX_RIGHTS.forEach((r) => {
			html += `<th class="ps-col-perm" title="${r}">${RIGHT_LABELS[r]}</th>`;
		});
		html += `</tr></thead><tbody>`;

		d.roles.forEach((row) => {
			html += `<tr class="ps-matrix-row">`;
			html += `<td class="ps-col-role">${esc(row.role)}</td>`;
			html += `<td class="ps-col-level">${row.permlevel}</td>`;
			html += `<td class="ps-col-owner">${row.if_owner ? "\u2713" : ""}</td>`;

			MATRIX_RIGHTS.forEach((r) => {
				const val = row.permissions[r];
				if (val === "na") {
					html += `<td class="ps-cell ps-cell-na">\u2014</td>`;
				} else {
					const cls = val ? "ps-cell-allow" : "ps-cell-deny";
					html += `<td class="ps-cell ${cls}">${val ? "\u2713" : "\u2717"}</td>`;
				}
			});

			html += `</tr>`;
		});

		html += `</tbody></table></div>`;
		this.wrapper.append($(html));
	}
}
