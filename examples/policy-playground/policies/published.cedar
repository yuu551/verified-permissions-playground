// Permit reading the team guide and the release draft.
permit (
    principal is Demo::User,
    action == Demo::Action::"read",
    resource
) when {
    [Demo::Document::"guide", Demo::Document::"release"].contains(resource)
};
