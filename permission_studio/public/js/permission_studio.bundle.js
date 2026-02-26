import { MatrixView } from "./components/matrix_view";
import { WhyExplainer } from "./components/why_explainer";
import { UserExplorer } from "./components/user_explorer";
import { RoleExplorer } from "./components/role_explorer";
import { MATRIX_RIGHTS, RIGHT_LABELS, PERM_ICONS } from "./utils/helpers";

// Register namespace
window.permission_studio = window.permission_studio || {};

class PermissionStudio {
	constructor(page) {
		this.page = page;
		this.current_tab = "user";
		this.components = {};

		this.setup_page();
		this.setup_tabs();
		this.render_tab("user");
	}

	setup_page() {
		this.page.set_title(__("Permission Studio"));

		this.$wrapper = $(`
			<div class="ps-app">
				<div class="ps-tabs"></div>
				<div class="ps-search-bar"></div>
				<div class="ps-content"></div>
			</div>
		`).appendTo(this.page.body);

		this.$tabs = this.$wrapper.find(".ps-tabs");
		this.$search = this.$wrapper.find(".ps-search-bar");
		this.$content = this.$wrapper.find(".ps-content");
	}

	setup_tabs() {
		const tabs = [
			{ key: "user", label: __("User View"), icon: "users" },
			{ key: "doctype", label: __("DocType View"), icon: "list" },
			{ key: "role", label: __("Role View"), icon: "tool" },
		];

		tabs.forEach((tab) => {
			const $tab = $(`
				<button class="ps-tab ${tab.key === this.current_tab ? "active" : ""}"
						data-tab="${tab.key}">
					${frappe.utils.icon(tab.icon, "sm")}
					<span>${tab.label}</span>
				</button>
			`);
			$tab.on("click", () => this.switch_tab(tab.key));
			this.$tabs.append($tab);
		});
	}

	switch_tab(tab_key) {
		if (tab_key === this.current_tab) return;
		this.current_tab = tab_key;
		this.$tabs.find(".ps-tab").removeClass("active");
		this.$tabs.find(`[data-tab="${tab_key}"]`).addClass("active");
		this.render_tab(tab_key);
	}

	render_tab(tab_key) {
		this.$search.empty();
		this.$content.empty();

		switch (tab_key) {
			case "user": this._render_user_tab(); break;
			case "doctype": this._render_doctype_tab(); break;
			case "role": this._render_role_tab(); break;
		}
	}

	_render_user_tab() {
		this.$search.html(`
			<div class="ps-search-row">
				<div class="ps-search-field" id="ps-user-select"></div>
				<div class="ps-search-field" id="ps-module-filter"></div>
				<div class="ps-search-field" id="ps-dt-search"></div>
			</div>
		`);

		this.user_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link", options: "User", fieldname: "user",
				placeholder: __("Select User..."), label: __("User"),
				change: () => {
					const user = this.user_field.get_value();
					if (user) this.load_user_matrix(user);
				},
			},
			parent: this.$search.find("#ps-user-select"),
			render_input: true,
		});

		this.module_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link", options: "Module Def", fieldname: "module",
				placeholder: __("All Modules"), label: __("Module"),
				change: () => {
					const user = this.user_field.get_value();
					if (user) this.load_user_matrix(user);
				},
			},
			parent: this.$search.find("#ps-module-filter"),
			render_input: true,
		});

		this.search_field = frappe.ui.form.make_control({
			df: { fieldtype: "Data", fieldname: "dt_search", placeholder: __("Filter DocTypes..."), label: __("Search") },
			parent: this.$search.find("#ps-dt-search"),
			render_input: true,
		});
		this.search_field.$input.on("input", () => {
			const query = (this.search_field.get_value() || "").toLowerCase();
			this.$content.find(".ps-matrix-row").each(function () {
				const dt = ($(this).data("doctype") || "").toLowerCase();
				$(this).toggle(dt.includes(query));
			});
		});

		this.$content.html(this._welcome_html(
			frappe.utils.icon("users", "lg"),
			__("Select a User"),
			__("Choose a user from the dropdown above to view their permission matrix across all DocTypes.")
		));
	}

	_render_doctype_tab() {
		this.$search.html(`
			<div class="ps-search-row">
				<div class="ps-search-field" id="ps-doctype-select"></div>
			</div>
		`);

		this.doctype_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link", options: "DocType", fieldname: "doctype",
				placeholder: __("Select DocType..."), label: __("DocType"),
				change: () => {
					const dt = this.doctype_field.get_value();
					if (dt) this.load_doctype_matrix(dt);
				},
			},
			parent: this.$search.find("#ps-doctype-select"),
			render_input: true,
		});

		this.$content.html(this._welcome_html(
			frappe.utils.icon("list", "lg"),
			__("Select a DocType"),
			__("Choose a DocType from the dropdown above to see which roles have access and what permissions they hold.")
		));
	}

	_render_role_tab() {
		this.$search.html(`
			<div class="ps-search-row">
				<div class="ps-search-field" id="ps-role-select"></div>
			</div>
		`);

		this.role_field = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link", options: "Role", fieldname: "role",
				placeholder: __("Select Role..."), label: __("Role"),
				change: () => {
					const role = this.role_field.get_value();
					if (role) this.load_role_matrix(role);
				},
			},
			parent: this.$search.find("#ps-role-select"),
			render_input: true,
		});

		this.$content.html(this._welcome_html(
			frappe.utils.icon("tool", "lg"),
			__("Select a Role"),
			__("Choose a role from the dropdown above to explore all permissions it grants, grouped by module.")
		));
	}

	load_user_matrix(user) {
		this.$content.html(this._show_skeleton(8));
		const module = this.module_field?.get_value() || null;

		frappe.call({
			method: "permission_studio.api.matrix.get_user_matrix",
			args: { user, module },
			callback: (r) => {
				if (r.message) {
					this.components.matrix = new MatrixView({
						wrapper: this.$content,
						data: r.message,
						mode: "user",
						on_why_click: (doctype, ptype) => this.show_why(user, doctype, ptype),
						on_restrictions_click: () => this.show_restrictions(user),
					});
				}
			},
			error: () => {
				this.$content.html(this._error_html(
					__("Failed to load permission matrix. Please try again."),
					() => this.load_user_matrix(user)
				));
			},
		});
	}

	load_doctype_matrix(doctype) {
		this.$content.html(this._show_skeleton(6));

		frappe.call({
			method: "permission_studio.api.matrix.get_doctype_matrix",
			args: { doctype },
			callback: (r) => {
				if (r.message) {
					this.components.matrix = new MatrixView({
						wrapper: this.$content,
						data: r.message,
						mode: "doctype",
					});
				}
			},
			error: () => {
				this.$content.html(this._error_html(
					__("Failed to load DocType permissions. Please try again."),
					() => this.load_doctype_matrix(doctype)
				));
			},
		});
	}

	load_role_matrix(role) {
		this.$content.html(this._show_skeleton(6));

		frappe.call({
			method: "permission_studio.api.matrix.get_role_matrix",
			args: { role },
			callback: (r) => {
				if (r.message) {
					this.components.matrix = new RoleExplorer({
						wrapper: this.$content,
						data: r.message,
					});
				}
			},
			error: () => {
				this.$content.html(this._error_html(
					__("Failed to load role permissions. Please try again."),
					() => this.load_role_matrix(role)
				));
			},
		});
	}

	show_why(user, doctype, ptype) {
		new WhyExplainer({ user, doctype, ptype });
	}

	show_restrictions(user) {
		new UserExplorer({ user });
	}

	_show_skeleton(count = 6) {
		let rows = "";
		for (let i = 0; i < count; i++) {
			rows += `
				<div class="ps-skeleton-row">
					<div class="ps-skeleton-cell ps-skel-label"></div>
					<div class="ps-skeleton-cell ps-skel-wide"></div>
					<div class="ps-skeleton-cell ps-skel-sm"></div>
					<div class="ps-skeleton-cell ps-skel-sm"></div>
					<div class="ps-skeleton-cell ps-skel-sm"></div>
					<div class="ps-skeleton-cell ps-skel-sm"></div>
				</div>`;
		}
		return `<div class="ps-loading">${rows}</div>`;
	}

	_welcome_html(icon, title, desc) {
		return `
			<div class="ps-welcome-state">
				<div class="ps-welcome-icon">${icon}</div>
				<div class="ps-welcome-title">${title}</div>
				<div class="ps-welcome-desc">${desc}</div>
			</div>`;
	}

	_error_html(msg, retry_fn) {
		const id = "ps-retry-" + Date.now();
		setTimeout(() => {
			$(`#${id}`).on("click", retry_fn);
		}, 0);
		return `
			<div class="ps-error-state">
				<div class="ps-error-icon">${frappe.utils.icon("error", "lg")}</div>
				<div class="ps-error-msg">${msg}</div>
				<button id="${id}" class="btn btn-sm btn-default">
					${frappe.utils.icon("refresh", "xs")} ${__("Retry")}
				</button>
			</div>`;
	}

	on_show() {}
}

Object.assign(window.permission_studio, {
	PermissionStudio,
	MatrixView,
	WhyExplainer,
	UserExplorer,
	RoleExplorer,
	MATRIX_RIGHTS,
	RIGHT_LABELS,
	PERM_ICONS,
});
