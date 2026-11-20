forbid(principal, action, resource)
when {
  principal is Work::User && resource is Work::Document &&
  (principal.role == "none" || principal.team != resource.team)
};
