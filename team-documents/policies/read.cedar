permit(principal, action == Work::Action::"read", resource)
when {
  (principal.role == "reader" || principal.role == "editor") &&
  (resource.published || principal == resource.owner)
};
