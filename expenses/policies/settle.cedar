permit(principal is Spend::User, action == Spend::Action::"pay", resource is Spend::Report)
when { principal.role == "finance" && resource.state == "approved" &&
       principal != resource.owner && principal != resource.approver };
