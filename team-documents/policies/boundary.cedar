forbid(principal, action, resource)
when { principal.role == "none" || principal.team != resource.team };
