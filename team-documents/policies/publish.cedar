permit(principal, action in [Work::Action::"create", Work::Action::"publish"], resource)
when { principal.role == "editor" && principal == resource.owner && !resource.published };
