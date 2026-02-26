"""
Permission Studio — Permission Resolver ("Why?" Explainer)

Traces the full permission evaluation chain for a specific
user + doctype + permission type and returns a human-readable
step-by-step explanation.
"""

import frappe
from frappe import _
from frappe.permissions import (
	get_doctypes_with_custom_docperms,
	get_roles,
	get_valid_perms,
)


@frappe.whitelist()
def explain_permission(user, doctype, ptype="read"):
	"""
	Return step-by-step permission evaluation trace.
	"""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Access denied."), frappe.PermissionError)

	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} does not exist.").format(user))
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} does not exist.").format(doctype))

	steps = []
	final_result = "deny"
	final_reason = ""

	# Step 1: Administrator Check
	is_admin = user == "Administrator"
	steps.append({
		"step": 1,
		"title": "Administrator Check",
		"status": "pass" if is_admin else "info",
		"description": (
			f"User '{user}' IS the Administrator — full access granted to everything."
			if is_admin
			else f"User '{user}' is not Administrator — proceeding to role checks."
		),
		"details": [],
	})

	if is_admin:
		return {
			"user": user,
			"doctype": doctype,
			"ptype": ptype,
			"result": "allow",
			"result_reason": "Administrator has unrestricted access to all DocTypes.",
			"steps": steps,
		}

	# Step 2: Role Check
	roles = get_roles(user, with_standard=True)
	all_perms = get_valid_perms(doctype=doctype, user=user)

	granting_roles = []
	if_owner_roles = []
	non_granting_roles = []

	for p in all_perms:
		if p.role not in roles:
			continue
		if p.permlevel != 0:
			continue

		if p.get(ptype):
			if p.get("if_owner"):
				if_owner_roles.append(p.role)
			else:
				granting_roles.append(p.role)
		else:
			non_granting_roles.append(p.role)

	details = []
	if granting_roles:
		details.append(f"Roles granting '{ptype}': {', '.join(sorted(set(granting_roles)))}")
	if if_owner_roles:
		details.append(f"Roles granting '{ptype}' (only if owner): {', '.join(sorted(set(if_owner_roles)))}")
	if non_granting_roles:
		details.append(f"Roles WITHOUT '{ptype}': {', '.join(sorted(set(non_granting_roles)))}")
	if not granting_roles and not if_owner_roles:
		details.append(f"No role grants '{ptype}' on '{doctype}'.")

	has_role_perm = bool(granting_roles)
	has_cond_perm = bool(if_owner_roles)

	custom_doctypes = get_doctypes_with_custom_docperms()
	perm_source = "Custom DocPerm (overridden)" if doctype in custom_doctypes else "Standard DocPerm"
	details.append(f"Permission source: {perm_source}")

	steps.append({
		"step": 2,
		"title": "Role Permission Check",
		"status": "pass" if has_role_perm else ("warn" if has_cond_perm else "fail"),
		"description": (
			f"User has {len(set(roles))} roles. "
			+ (
				f"Role(s) grant '{ptype}' access."
				if has_role_perm
				else (
					f"Role(s) grant '{ptype}' only if user is document owner."
					if has_cond_perm
					else f"No role grants '{ptype}' permission."
				)
			)
		),
		"details": details,
	})

	# Step 3: if_owner Evaluation
	if has_cond_perm and not has_role_perm:
		steps.append({
			"step": 3,
			"title": "Ownership Condition (if_owner)",
			"status": "warn",
			"description": (
				f"Permission '{ptype}' is conditional — user can only '{ptype}' "
				f"documents they OWN (created by them)."
			),
			"details": [
				f"if_owner roles: {', '.join(sorted(set(if_owner_roles)))}",
				"This means: access depends on document ownership at runtime.",
			],
		})
		final_result = "cond"
		final_reason = (
			f"'{ptype}' is conditionally allowed — only on documents owned by this user "
			f"(via role: {', '.join(sorted(set(if_owner_roles)))})."
		)
	elif has_role_perm:
		steps.append({
			"step": 3,
			"title": "Ownership Condition (if_owner)",
			"status": "info",
			"description": "Not applicable — user has unconditional role permission.",
			"details": [],
		})
	else:
		steps.append({
			"step": 3,
			"title": "Ownership Condition (if_owner)",
			"status": "info",
			"description": "No if_owner rules apply for this permission.",
			"details": [],
		})

	# Step 4: User Permission Restrictions
	user_perms = frappe.get_all(
		"User Permission",
		filters={"user": user},
		fields=["allow", "for_value", "applicable_for", "apply_to_all_doctypes"],
	)

	affecting_restrictions = []
	meta = frappe.get_meta(doctype)
	link_fields = {f.options: f.fieldname for f in meta.get_link_fields() if f.options}

	for up in user_perms:
		if up.apply_to_all_doctypes:
			if up.allow in link_fields or up.allow == doctype:
				affecting_restrictions.append(up)
		elif up.applicable_for == doctype:
			affecting_restrictions.append(up)

	if affecting_restrictions:
		restriction_details = []
		for r in affecting_restrictions:
			field = link_fields.get(r.allow, "direct")
			restriction_details.append(
				f"Restricted to {r.allow} = '{r.for_value}' (via field: '{field}')"
			)

		steps.append({
			"step": 4,
			"title": "User Permission Restrictions",
			"status": "warn",
			"description": (
				f"User has {len(affecting_restrictions)} restriction(s) "
				f"that filter which '{doctype}' documents they can access."
			),
			"details": restriction_details,
		})
	else:
		steps.append({
			"step": 4,
			"title": "User Permission Restrictions",
			"status": "info",
			"description": f"No User Permission restrictions affect '{doctype}' for this user.",
			"details": [],
		})

	# Step 5: DocShare Check
	# DocShare table only has read, write, share, submit columns
	share_count = 0
	if ptype in ("read", "write", "share", "submit"):
		share_count = frappe.db.count(
			"DocShare",
			{"user": user, "share_doctype": doctype, ptype: 1},
		)

	if share_count and not has_role_perm and not has_cond_perm:
		steps.append({
			"step": 5,
			"title": "Document Sharing Check",
			"status": "pass",
			"description": (
				f"User has {share_count} shared '{doctype}' document(s) "
				f"with '{ptype}' permission."
			),
			"details": [
				"Shared documents bypass role permission requirements.",
				"Note: sharing grants access to specific documents only, not all.",
			],
		})
		final_result = "allow"
		final_reason = f"'{ptype}' allowed via document sharing ({share_count} shared document(s))."
	else:
		steps.append({
			"step": 5,
			"title": "Document Sharing Check",
			"status": "info" if has_role_perm else "fail",
			"description": (
				"Not needed — role permission already grants access."
				if has_role_perm
				else f"No shared documents found with '{ptype}' permission."
			),
			"details": [],
		})

	# Step 6: Final Result
	if has_role_perm and final_result != "allow":
		final_result = "allow"
		final_reason = f"'{ptype}' allowed via role: {', '.join(sorted(set(granting_roles)))}."

	if final_result == "deny" and not final_reason:
		final_reason = (
			f"'{ptype}' denied — no role grants this permission, "
			f"no shared documents, and no if_owner condition applies."
		)

	steps.append({
		"step": 6,
		"title": "Final Result",
		"status": "pass" if final_result == "allow" else ("warn" if final_result == "cond" else "fail"),
		"description": (
			f"{'ALLOWED' if final_result == 'allow' else ('CONDITIONAL' if final_result == 'cond' else 'DENIED')}: "
			+ final_reason
		),
		"details": [],
	})

	return {
		"user": user,
		"doctype": doctype,
		"ptype": ptype,
		"result": final_result,
		"result_reason": final_reason,
		"steps": steps,
	}
