// An explicit forbid takes precedence over a permit.
forbid (
    principal,
    action == Demo::Action::"read",
    resource == Demo::Document::"release"
);
