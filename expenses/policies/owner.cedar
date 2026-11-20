permit(principal is Spend::User, action == Spend::Action::"view", resource is Spend::Report)
when { principal.role != "none" && principal == resource.owner };
