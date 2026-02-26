import { MATRIX_RIGHTS, RIGHT_LABELS, esc } from "../utils/helpers";

export class RoleExplorer {
	constructor(opts) {
		this.wrapper = opts.wrapper;
		this.data = opts.data;
		this.render();
	}

	render() {
		this.wrapper.empty();
		const d = this.data;

		// Header
		this.wrapper.append($(`
			<div class="ps-matrix-header">
				<div class="ps-role-info">
					<h3>${esc(d.role)}</h3>
					<div class="ps-stats">
						${__("{0} DocTypes across {1} modules", [d.total_doctypes, d.modules.length])} |
						${__("{0} users have this role", [d.user_count])}
					</div>
				</div>
			</div>
		`));

		if (!d.modules || !d.modules.length) {
			this.wrapper.append($(`<div class="ps-empty-state">${__("This role has no permissions assigned to any DocType.")}</div>`));
			return;
		}

		// Module-grouped tables
		d.modules.forEach((mod) => {
			let html = `
				<div class="ps-module-group">
					<div class="ps-module-header">
						<strong>${esc(mod.module)}</strong>
						<span class="ps-module-count">(${mod.doctypes.length})</span>
					</div>
					<table class="ps-matrix-table ps-matrix-compact">
						<thead><tr><th class="ps-col-doctype">${__("DocType")}</th>`;

			MATRIX_RIGHTS.forEach((r) => {
				html += `<th class="ps-col-perm" title="${r}">${RIGHT_LABELS[r]}</th>`;
			});
			html += `</tr></thead><tbody>`;

			mod.doctypes.forEach((row) => {
				html += `<tr><td class="ps-col-doctype">
					<a href="/app/${frappe.router.slug(row.doctype)}" target="_blank">${esc(row.doctype)}</a>
					${row.if_owner ? '<span class="ps-badge ps-badge-owner">if_owner</span>' : ""}
				</td>`;

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
		});
	}
}
