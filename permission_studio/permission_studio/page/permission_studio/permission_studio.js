frappe.pages["permission-studio"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Permission Studio"),
		single_column: true,
	});

	wrapper.page = page;
	wrapper.studio = new permission_studio.PermissionStudio(page);
};

frappe.pages["permission-studio"].on_page_show = function (wrapper) {
	if (wrapper.studio) {
		wrapper.studio.on_show();
	}
};
