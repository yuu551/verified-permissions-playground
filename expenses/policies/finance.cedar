permit(principal is Spend::User, action == Spend::Action::"view", resource is Spend::Report)
when { principal.role == "finance" && (resource.state == "approved" || resource.state == "paid") };
