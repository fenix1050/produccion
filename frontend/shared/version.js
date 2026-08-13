// Version of the app shown in the sidebar credit line, rendered by
// renderSidebarFooter() in shared/sidebar.js for every page (cotizar, historial,
// configuracion, admin). It used to live in cotizar/constants.js, which made it
// unreachable for the other three pages without importing across feature folders —
// hence the move to shared/.
// UI chrome only, not database-backed. Bump by hand on a visible change worth versioning.
export const APP_VERSION = '1.0.1'
