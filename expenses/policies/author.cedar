permit(principal is Spend::User,
       action in [Spend::Action::"create", Spend::Action::"edit", Spend::Action::"submit"],
       resource is Spend::Report)
when { principal.role != "none" && principal == resource.owner &&
       principal.team == resource.team && (resource.state == "draft" || resource.state == "returned") };
