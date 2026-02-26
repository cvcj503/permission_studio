"""
Permission Studio — Matrix APIs

Provides whitelisted methods to compute effective permission matrices
for users, doctypes, and roles. All methods are READ-ONLY.
"""

import frappe
from frappe import _
from frappe.permissions import (
	get_all_perms,
	get_doctypes_with_custom_docperms,
	get_roles,
	get_valid_perms,
)

# Permission types shown in the matrix (ordered)
MATRIX_RIGHTS = [
	"select", "read", "write", "create", "delete",
	"submit", "cancel", "amend",
	"print", "email", "report", "import", "export", "share",
]

# Submittable-only permission types
SUBMITTABLE_ONLY = {"submit", "cancel", "amend"}


def _check_access():
	"""Guard: only System Manager can call these APIs."""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(
			_("Permission Studio is only accessible to System Managers."),
			frappe.PermissionError,
		)


@frappe.whitelist()
def has_studio_access():
	"""Check if current user can access Permission Studio."""
	return "System Manager" in frappe.get_roles()


@frappe.whitelist()
def get_user_matrix(user, module=None):
	"""
	Return effective permissions for ALL DocTypes for a given user.

	Args:
		user: User email
		module: Optional module filter

	Returns:
		dict with user info, roles, and permission matrix
	"""
	_check_access()

	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} does not exist.").format(user))

	# Get user's roles
	roles = get_roles(user, with_standard=True)

	# Get role profile
	role_profile = frappe.db.get_value("User", user, "role_profile_name")

	# Get ALL non-child DocTypes
	doctype_list = _get_all_doctypes(module)

	# Get all valid perms for this user (single batch query)
	all_perms = get_valid_perms(user=user)

	# Build perm lookup: { doctype: [perm_rules] }
	perm_by_doctype = {}
	for p in all_perms:
		dt = p.parent
		if dt not in perm_by_doctype:
			perm_by_doctype[dt] = []
		perm_by_doctype[dt].append(p)

	# Build matrix
	matrix = []
	for dt_info in doctype_list:
		dt_name = dt_info["name"]
		dt_module = dt_info["module"]
		is_submittable = bool(dt_info.get("is_submittable"))

		perms = perm_by_doctype.get(dt_name, [])
		perm_dict = _compute_effective_perms(perms, roles, is_submittable)

		matrix.append({
			"doctype": dt_name,
			"module": dt_module,
			"is_submittable": is_submittable,
			"permissions": perm_dict,
		})

	# Sort: DocTypes with any access first, then by module + name
	matrix.sort(key=lambda x: (
		0 if any(v in ("allow", "cond") for v in x["permissions"].values()) else 1,
		x["module"],
		x["doctype"],
	))

	return {
		"user": user,
		"roles": sorted(roles),
		"role_profile": role_profile,
		"total_doctypes": len(doctype_list),
		"matrix": matrix,
	}


@frappe.whitelist()
def get_doctype_matrix(doctype):
	"""
	Return all roles with their permission levels for a specific DocType.
	"""
	_check_access()

	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} does not exist.").format(doctype))

	meta = frappe.get_meta(doctype)
	is_submittable = bool(meta.is_submittable)

	# Check if custom perms exist
	custom_doctypes = get_doctypes_with_custom_docperms()
	has_custom = doctype in custom_doctypes

	# Get standard perms
	standard_perms = frappe.get_all(
		"DocPerm",
		filters={"parent": doctype},
		fields=["role", "permlevel", "if_owner"] + MATRIX_RIGHTS,
		order_by="idx asc",
	)

	# Get custom perms (if any)
	custom_perms = []
	if has_custom:
		custom_perms = frappe.get_all(
			"Custom DocPerm",
			filters={"parent": doctype},
			fields=["role", "permlevel", "if_owner"] + MATRIX_RIGHTS,
			order_by="idx asc",
		)

	# Use custom perms if they exist, otherwise standard
	active_perms = custom_perms if has_custom else standard_perms
	source_label = "custom" if has_custom else "standard"

	roles = []
	for p in active_perms:
		perm_dict = {}
		for right in MATRIX_RIGHTS:
			if right in SUBMITTABLE_ONLY and not is_submittable:
				perm_dict[right] = "na"
			else:
				perm_dict[right] = int(bool(p.get(right, 0)))

		roles.append({
			"role": p.role,
			"source": source_label,
			"if_owner": bool(p.get("if_owner", 0)),
			"permlevel": p.get("permlevel", 0),
			"permissions": perm_dict,
		})

	return {
		"doctype": doctype,
		"module": meta.module or "",
		"is_submittable": is_submittable,
		"is_custom": has_custom,
		"roles": roles,
	}


@frappe.whitelist()
def get_role_matrix(role):
	"""
	Return all DocTypes a role has permissions for, grouped by module.
	"""
	_check_access()

	if not frappe.db.exists("Role", role):
		frappe.throw(_("Role {0} does not exist.").format(role))

	# Get all perms for this role
	all_perms = get_all_perms(role)

	# Get user count for this role
	user_count = frappe.db.count("Has Role", {"role": role, "parenttype": "User"})

	# Get submittable DocTypes set
	submittable_set = set(
		frappe.get_all("DocType", filters={"is_submittable": 1}, pluck="name")
	)

	# Custom perm doctypes
	custom_doctypes = get_doctypes_with_custom_docperms()

	# Build per-doctype permissions
	dt_perms = {}
	for p in all_perms:
		dt_name = p.parent
		if not dt_name:
			continue
		if dt_name not in dt_perms:
			dt_perms[dt_name] = {
				"perms": [],
				"is_submittable": dt_name in submittable_set,
				"source": "custom" if dt_name in custom_doctypes else "standard",
			}
		dt_perms[dt_name]["perms"].append(p)

	# Get module for each doctype
	dt_modules = {}
	if dt_perms:
		for dt_info in frappe.get_all(
			"DocType",
			filters={"name": ["in", list(dt_perms.keys())]},
			fields=["name", "module"],
		):
			dt_modules[dt_info["name"]] = dt_info["module"] or "Other"

	# Build grouped-by-module structure
	module_map = {}
	for dt_name, dt_data in dt_perms.items():
		mod = dt_modules.get(dt_name, "Other")
		is_sub = dt_data["is_submittable"]

		# Aggregate permissions across all rules for this doctype
		agg_perms = {}
		has_if_owner = False
		for p in dt_data["perms"]:
			if p.get("if_owner"):
				has_if_owner = True
			for right in MATRIX_RIGHTS:
				if right in SUBMITTABLE_ONLY and not is_sub:
					agg_perms[right] = "na"
				elif p.get(right):
					agg_perms[right] = 1
				elif right not in agg_perms:
					agg_perms[right] = 0

		if mod not in module_map:
			module_map[mod] = []

		module_map[mod].append({
			"doctype": dt_name,
			"is_submittable": is_sub,
			"source": dt_data["source"],
			"if_owner": has_if_owner,
			"permissions": agg_perms,
		})

	# Convert to sorted list
	modules = []
	for mod_name in sorted(module_map.keys()):
		doctypes = sorted(module_map[mod_name], key=lambda x: x["doctype"])
		modules.append({
			"module": mod_name,
			"doctypes": doctypes,
		})

	return {
		"role": role,
		"user_count": user_count,
		"total_doctypes": sum(len(m["doctypes"]) for m in modules),
		"modules": modules,
	}


def _get_all_doctypes(module=None):
	"""Get all non-child DocTypes."""
	filters = {"istable": 0}
	if module:
		filters["module"] = module

	return frappe.get_all(
		"DocType",
		filters=filters,
		fields=["name", "module", "is_submittable"],
		order_by="name asc",
	)


def _compute_effective_perms(perm_rules, user_roles, is_submittable):
	"""
	Given permission rules and user's roles, compute effective permission for each right.
	Returns dict: { "read": "allow"|"deny"|"cond"|"na", ... }
	"""
	result = {}

	for right in MATRIX_RIGHTS:
		if right in SUBMITTABLE_ONLY and not is_submittable:
			result[right] = "na"
			continue

		has_direct = False
		has_if_owner = False

		for p in perm_rules:
			if p.role not in user_roles:
				continue
			if p.permlevel != 0:
				continue
			if p.get(right):
				if p.get("if_owner"):
					has_if_owner = True
				else:
					has_direct = True

		if has_direct:
			result[right] = "allow"
		elif has_if_owner:
			result[right] = "cond"
		else:
			result[right] = "deny"

	return result
