// `server-only` throws when imported outside a React Server Component. The
// migration, seed and test scripts import the same database modules the app
// does, from plain node, so for those runs the guard is aliased to nothing.
export {};
