"""
Permission Studio — User Restrictions Summary

Returns consolidated view of all User Permissions (restrictions)
and DocShare records for a given user.
"""

import frappe
from frappe import _


def _check_access():
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Access denied."), frappe.PermissionError)


@frappe.whitelist()
def get_user_restrictions(user):
	"""Return all User Permission restrictions and their affected DocTypes."""
	_check_access()

	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} does not exist.").format(user))

	user_perms = frappe.get_all(
		"User Permission",
		filters={"user": user},
		fields=[
			"name", "allow", "for_value", "applicable_for",
			"apply_to_all_doctypes", "is_default", "hide_descendants",
		],
		order_by="allow asc, for_value asc",
	)

	link_map = _build_link_field_map()

	restrictions = []
	summary = {}

	for up in user_perms:
		allow_dt = up.allow
		for_value = up.for_value

		if up.apply_to_all_doctypes:
			affected = link_map.get(allow_dt, [])
		elif up.applicable_for:
			affected = [up.applicable_for]
		else:
			affected = link_map.get(allow_dt, [])

		restrictions.append({
			"allow": allow_dt,
			"for_value": for_value,
			"apply_to_all": bool(up.apply_to_all_doctypes),
			"applicable_for": up.applicable_for,
			"is_default": bool(up.is_default),
			"affected_doctypes": sorted(affected),
		})

		if allow_dt not in summary:
			summary[allow_dt] = []
		if for_value not in summary[allow_dt]:
			summary[allow_dt].append(for_value)

	return {
		"user": user,
		"restrictions": restrictions,
		"restriction_summary": summary,
	}


@frappe.whitelist()
def get_user_shares(user):
	"""Return all DocShare records for a user."""
	_check_access()

	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} does not exist.").format(user))

	shares = frappe.get_all(
		"DocShare",
		filters={"user": user},
		fields=[
			"share_doctype", "share_name",
			"read", "write", "share", "submit",
			"everyone", "owner", "creation",
		],
		order_by="creation desc",
		limit=100,
	)

	return {
		"user": user,
		"shares": [
			{
				"doctype": s.share_doctype,
				"docname": s.share_name,
				"read": bool(s.read),
				"write": bool(s.write),
				"share": bool(s.share),
				"submit": bool(s.submit),
				"everyone": bool(s.everyone),
				"owner": s.owner,
				"creation": str(s.creation),
			}
			for s in shares
		],
		"total": len(shares),
	}


def _build_link_field_map():
	"""
	Build map: { target_doctype: [doctypes_that_link_to_it] }
	E.g., { "Company": ["Sales Order", "Purchase Order", ...] }
	"""
	link_map = {}

	link_fields = frappe.get_all(
		"DocField",
		filters={"fieldtype": "Link", "options": ["is", "set"]},
		fields=["parent", "options"],
		distinct=True,
	)

	for lf in link_fields:
		target = lf.options
		source = lf.parent
		if target not in link_map:
			link_map[target] = []
		if source not in link_map[target]:
			link_map[target].append(source)

	# Also check Custom Fields
	custom_link_fields = frappe.get_all(
		"Custom Field",
		filters={"fieldtype": "Link", "options": ["is", "set"]},
		fields=["dt", "options"],
		distinct=True,
	)

	for clf in custom_link_fields:
		target = clf.options
		source = clf.dt
		if target not in link_map:
			link_map[target] = []
		if source not in link_map[target]:
			link_map[target].append(source)

	return link_map
