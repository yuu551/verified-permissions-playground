permit(principal is Spend::User,
       action in [Spend::Action::"view", Spend::Action::"approve", Spend::Action::"return"],
       resource is Spend::Report)
when { principal.role == "manager" && principal.team == resource.team &&
       principal != resource.owner && resource.state == "submitted" };
