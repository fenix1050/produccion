// Layout compartido de la Carta Oferta (header/footer/paleta Tajy) para todos los ramos.
// Cada ramo aporta el contenido de página 1 (datos del riesgo + plan de pago) y página 2
// (coberturas + condiciones) — ver mrc.js para el primer caso implementado.

const TAJY_LOGO_SVG = `<svg viewBox="0 0 206.2 156" xmlns="http://www.w3.org/2000/svg" style="height:42px;width:auto;"><g fill="#fff"><path d="m59.8 33.3-5.5.1c-3.7.4-7.8.1-11.5.5-3.7.3-7.6.3-11.4.7-2.5.2-5 .5-7.5.7s-4.7.3-7.2.5c-2.7.2-4.5.4-7.2-.5-2.2-.7-3-1.4-5.6-3.5-1.7-1.3-3.3-5.6-3.4-6.1-.1-.2-.4-2.5-.5-2.7-1.1-4.5 2.3-4.1 2.6-3.9l1 1c.5.8 1 1.8 1.4 2.2 1.4 1.4 9.2.9 10.6.9 7-.3 33.7-1.3 40.4-1.3 10.8 0 21.5-.7 31.8-1.2 4.7-.2 9.4-.4 14.1-.5s9.3 0 14.1.4c2.2.2 4.4.5 6.6.9 2.2.3 4.3.9 6.5 1.8 2.4 1 4.5 2.3 6.3 3.8s3.3 3.4 4.4 5.6c.2.4.4.8.6 1.2s.1.7-.3 1c-.2.2-.6.3-1 .3s-.8 0-1.2-.1c-1.1-.2-2-.6-2.9-1-2.2-.9-4.4-1.6-6.7-2.1s-4.6-.8-7-.9c-4.1-.3-8.1-.4-12.1-.4s-8 .1-12.1.3c-3.5.2-7 .3-10.5.6-3.5.2-7 .5-10.5.7h-.6c-.7 1.5-1.5 2.9-2.1 4.2-.7 1.3-1.3 2.7-2 4.1-3.7 7.6-7.4 15.1-11 22.6-3.6 7.4-7.2 15-10.8 22.6-2.9 6.2-5.7 12.4-8.3 18.6s-4.9 12.6-6.9 19.1c-.9 2.8-1.7 5.5-2.4 8.2s-1.3 5.5-1.7 8.3c-.2 1.5-.3 3.1-.4 4.7s-.3 3.1-.6 4.7c-.2 1-.4 2-.7 2.9-.3 1-.6 1.9-.9 2.8-.6 1.4-1.5 1.6-2.7.7-.7-.5-1.3-1.1-1.7-1.7-1.7-2.5-3-5-3.7-7.7-.7-2.6-1-5.4-.8-8.3.2-3.7.6-7.3 1.4-10.8s1.8-7 2.9-10.5c2.4-7.4 5.1-14.8 8-21.9 2.9-7.2 6.1-14.4 9.4-21.6 3-6.4 6-12.8 9.2-19.1 3.1-6.3 6.3-12.7 9.4-19.1z"/><path d="m94.3 92.2-1.5 1.4-10 10c-.4.4-.8.7-1.2 1s-.8.6-1.2 1c-1.7 1.3-3.8 1.6-6.2.8-3.3-1.2-5.5-3.3-6.6-6.3-.7-2.1-.9-4.5-.6-7.1.4-3.6 1.3-7.1 2.6-10.4s3-6.6 5.1-9.7c1.9-2.8 4-5.5 6.2-8.1s4.7-4.9 7.5-7.1c1.4-1.1 2.9-2.1 4.5-2.9 1.6-.9 3.4-1.5 5.3-2.1 3.2-.9 6.1-1 8.8-.3s5.3 2.1 7.7 4.2c1.7 1.3 2.9 3 3.6 4.9.5 1.2.5 2.3.1 3.3-.4 1.2-1.1 1.9-2 2s-1.8-.2-2.7-1.1c-.6-.5-.9-1.1-1.1-1.7-.1-.6-.2-1.2-.3-1.8-.2-1-.4-1.7-.7-1.9-.3-.3-1-.4-2.2-.5s-2.5-.1-3.6.2c-1.2.3-2.3.7-3.4 1.2-2.2 1-4.1 2.2-5.9 3.5-1.7 1.3-3.4 2.7-5.1 4.2-4 3.8-7.3 7.9-9.9 12.3s-4.5 9.2-5.7 14.3c-.1.4-.1.7-.2 1 0 .3-.1.6-.1 1v.7c0 .2 0 .5.1.9l1.4-1.1c3.2-2.8 6.1-5.7 8.8-8.8 2.7-3 5.4-6.1 8.1-9.3 1.3-1.7 2.8-3.4 4.4-5.2.2-.4.5-.7.7-.9.2-.3.5-.5.8-.7.7-.6 1.4-1.2 2-1.8s1.1-1.4 1.5-2.2c.7-1.1 1.7-1.6 3.2-1.3 1 .1 2 .4 2.9.8s1.7.9 2.5 1.6c1.2 1 1.6 2.1 1 3.3-1 2.4-2 4.7-2.9 7s-1.8 4.6-2.7 7c-.4 1-.8 1.9-1.1 2.8s-.6 1.9-.9 2.9l.5.2 1.2-1 20.2-18c.2-.1.5-.3.7-.6.2-.2.5-.4.9-.6.6-.4 1.2-.6 1.9-.4.2 0 .5.1.8.2.3.2.5.3.6.4.2.2.2.5 0 .8s-.3.5-.5.7c-.7.8-1.5 1.6-2.4 2.3-.8.7-1.7 1.5-2.5 2.3-2.9 2.9-5.8 5.8-8.7 8.7s-5.8 5.8-8.7 8.7l-6 6.3c-2.7 2.7-5.7 3-9 .9-1.3-.9-1.9-2.2-1.7-3.9.2-1 .3-2 .5-3s.3-2 .5-3c.3-.2.4-.9.7-2"/><path d="m137.5 90.3c1.1-.9 2.1-1.7 3.1-2.4 1-.8 1.9-1.6 2.8-2.4 1.7-1.6 3.5-3.2 5.2-4.8 1.7-1.7 3.4-3.3 5-4.8.7-.6 1.2-.9 1.6-.9.9.2 1.6.5 2 1 .2.2.2.4 0 .8s-.3.7-.5.8c-1 1.1-2 2.1-3 3.1s-2 2.1-3.1 3.1l-15 15.7c-.2.2-.4.5-.6.9-.1.3-.3.7-.4 1.1-1.4 4.9-2.8 9.8-4.2 14.7s-2.8 9.8-4.2 14.7c-.8 2.6-1.8 5.1-2.9 7.5s-2.3 4.8-3.7 7.2c-.6.9-1.2 1.9-1.9 2.8s-1.4 1.8-2.1 2.7c-3 3.3-6.9 4.9-11.6 4.8-4.8 0-7.4-2.3-7.8-6.8-.2-1.8-.1-3.5.1-5.3.2-1.7.7-3.5 1.4-5.3 1.1-3.2 2.5-6.2 4.2-9s3.6-5.6 5.8-8.2c1.9-2.3 3.9-4.7 5.9-7s4-4.6 6-6.9c.8-.9 1.5-2.1 1.9-3.4 1.2-4.7 2.3-9.3 3.4-13.8s2.5-9.1 4.2-13.6c1-2.6 2-5.1 3-7.7s2-5.1 3.1-7.7c.5-1.1 1.2-2.2 2-3.3 1.4-1.8 3.1-2.1 5.1-1 .8.4 1.5.9 2.1 1.4 1.2 1.1 1.6 2.3 1 3.7-.9 1.9-1.6 3.9-2 5.9s-.9 4-1.5 6.1c-.7 2.6-1.3 5.1-2 7.6s-1.3 5.1-2 7.6c-.1.2-.2.5-.4 1.1m-20.2 30.7c-.1 0-.2 0-.2-.1-.1 0-.2-.1-.3-.1l-3.5 4.8c-1.7 2.3-3.2 4.7-4.5 7.2-1.3 2.4-2.4 5-3.2 7.7-.7 2.5-1.1 4.9-1 7.2 0 .5 0 .9.1 1.4s.3 1 .7 1.5c.3-.4.6-.7.9-1s.5-.6.7-.9c.6-.9 1.2-1.7 1.7-2.6.6-.9 1.1-1.8 1.5-2.6 1.2-2.5 2.3-5 3.1-7.6s1.5-5.2 2.2-7.9zm22.6-72.1.9-3.3c.3-.9.7-1.7 1-2.7.3-.9.7-1.8 1.1-2.7.7-1.3 1.7-1.7 3.2-1.3 1.2.2 2.2.6 3 1.2s1.6 1.3 2.2 2.2c.9 1.1 1 2.3.2 3.5-.4.6-.8 1.3-1.2 2s-.7 1.4-.9 2.1c-.3.8-.6 1.6-.9 2.4-.2.8-.5 1.7-.6 2.5-.2.9-.8 1.2-1.6 1.2-.7 0-1.5-.2-2.3-.6s-1.5-1-2.1-1.7-1.1-1.5-1.5-2.3c-.3-.8-.5-1.6-.5-2.5"/><path d="m194.4 82.7c.4-.4.9-.9 1.3-1.3.5-.4.9-.9 1.3-1.4.8-.9 1.7-1.8 2.6-2.7s1.8-1.8 2.7-2.8c.7-.7 1.4-1 2.2-.8 1.8.2 2.2 1 1 2.3-.6.7-1.2 1.5-1.9 2.2s-1.3 1.4-2 2.1l-8.2 8.4c-.9 1-1.5 2.2-1.7 3.3-1.6 6.3-3.3 12.5-5 18.6-1.8 6.1-3.8 12.2-6.2 18.4-.7 1.7-1.4 3.4-2.1 5.2-.7 1.7-1.5 3.5-2.4 5.2-1 2-2.1 3.9-3.4 5.7s-2.7 3.5-4.3 5.2c-1.3 1.4-2.8 2.6-4.5 3.6s-3.5 1.6-5.6 1.9c-1.2.2-2.4.3-3.6.1-1.1-.2-2.2-.4-3.3-.8-1.9-.7-3.1-1.9-3.6-3.7-.8-2.7-.8-5.4 0-8 .7-1.9 1.6-3.9 2.4-5.8.9-1.9 1.9-3.8 3.1-5.7 2.4-4.1 5-8 7.8-11.8s5.8-7.6 8.9-11.4c1.3-1.7 2.8-3.4 4.4-5.2 1-1 1.6-2.1 1.9-3.4s.7-2.5 1-3.6.7-2.3 1.1-3.6v-.6c0-.2 0-.5.1-.9l-1.5 1.7c-2.3 2.9-4.6 5.6-6.9 8.1-.9 1-1.9 1.8-2.9 2.4s-2.3 1-3.7 1.2c-2.2.2-4.3-.1-6.2-.8-1.9-.8-3.2-2.3-3.9-4.5-.5-1.7-.9-3.4-1.1-5.1s-.3-3.4-.1-5.2c.5-5.1 1.4-10.1 2.7-14.9s3.1-9.6 5.2-14.5l1.7-3.1c.7-.8 1.5-1.3 2.4-1.3 2.4-.1 4.4.4 5.9 1.6.4.3.7.6.9.9s.2.8.1 1.4c-1.2 3.3-2.3 6.6-3.4 9.9s-2.2 6.6-3.2 9.9c-.9 2.6-1.6 5.2-2.1 7.8s-.8 5.3-1 7.9c-.2 1.9-.1 3.7.5 5.7l1.6-1.3c3.5-3.7 6.9-7.5 10.1-11.3s6.1-7.9 8.6-12.2c.5-.8.9-1.7 1.2-2.6s.7-1.8 1.1-2.7c.7-1.9 1.3-3.8 2.1-5.7.7-1.9 1.4-3.7 2.2-5.6.2-.4.3-.7.4-1s.3-.6.4-.9c.6-1 1.5-1.3 2.6-1.1 2 .4 3.8 1.3 5.4 2.8.4.5.6 1.1.7 1.7 0 .6 0 1.2-.2 1.8-.3 1.3-.5 2.5-.7 3.8s-.5 2.6-.9 3.8c-.7 3.9-1.4 7.7-2.2 11.2-.1.3-.1.7-.1 1.1.1 0 .1 0 .2.1 0 .2 0 .3.1.3m-21.9 31.2c-.1 0-.1 0-.2-.1 0 0-.1-.1-.2-.1-.3.4-.5.7-.8 1.1s-.6.7-.9 1.1l-4.7 6.7c-2.8 3.8-5.2 7.6-7.1 11.6-.8 1.7-1.6 3.4-2.3 5.1s-1.1 3.5-1.3 5.4c-.1 1-.1 1.9.1 2.9.1 1 .5 1.9 1.1 2.9l2.2-1.9c1.3-1.4 2.5-2.9 3.4-4.4 1-1.5 1.8-3.1 2.6-4.7 1.9-4.2 3.4-8.5 4.5-12.8 1-4.2 2.2-8.5 3.6-12.8"/><path d="m0 12.9 5.9-12.7c.1-.1.2-.2.3-.2h.2c.2 0 .3.1.3.2l5.8 12.7c.1.2 0 .5-.3.5h-1.6c-.3 0-.4-.1-.5-.4l-.9-2h-5.7l-.9 2c-.1.2-.2.4-.5.4h-1.7c-.3 0-.5-.2-.4-.5m8.2-4-1.9-4.2-1.9 4.2z"/><path d="m13.5 11.6.7-1.2c.2-.3.5-.3.6-.1.1.1 1.6 1.2 2.9 1.2 1 0 1.7-.6 1.7-1.5 0-1-.8-1.6-2.4-2.3-1.8-.7-3.6-1.9-3.6-4.1 0-1.7 1.2-3.6 4.3-3.6 1.9 0 3.4 1 3.8 1.3.2.1.2.4.1.6l-.7 1.1c-.2.2-.4.4-.7.2-.2-.1-1.6-1-2.6-1-1.1 0-1.7.7-1.7 1.3 0 .9.7 1.5 2.2 2.1 1.8.7 4 1.8 4 4.3 0 1.9-1.7 3.7-4.4 3.7-2.4 0-3.8-1.1-4.2-1.5 0-.1-.1-.2 0-.5"/><path d="m24.6.5c0-.2.2-.4.4-.4h7.7c.2 0 .4.2.4.4v1.6c0 .2-.2.4-.4.4h-5.7v3.1h4.7c.2 0 .4.2.4.4v1.6c0 .2-.2.4-.4.4h-4.7v3.3h5.6c.2 0 .4.2.4.4v1.6c0 .2-.2.4-.4.4h-7.7c-.2 0-.4-.2-.4-.4v-12.8z"/><path d="m41.5 0c1.7 0 3.3.7 4.6 1.8.2.2.2.4 0 .5l-1.2 1.2c-.2.2-.3.2-.5 0-.8-.7-1.8-1.1-2.9-1.1-2.4 0-4.2 2-4.2 4.4 0 2.3 1.9 4.3 4.3 4.3 1.1 0 1.9-.3 2.3-.5v-1.5h-1.5c-.2 0-.4-.2-.4-.3v-1.6c0-.2.2-.4.4-.4h3.6c.2 0 .3.2.3.4v4.8c0 .2-.1.2-.2.3 0 0-1.9 1.2-4.7 1.2-3.8 0-6.8-3-6.8-6.8.1-3.7 3.1-6.7 6.9-6.7"/><path d="m48.9.5c0-.2.2-.4.4-.4h1.8c.2 0 .4.2.4.4v7.7c0 1.6 1.1 2.9 2.7 2.9s2.8-1.3 2.8-2.9v-7.7c0-.2.2-.4.4-.4h1.8c.2 0 .4.2.4.4v7.9c0 2.9-2.3 5.2-5.3 5.2s-5.3-2.3-5.3-5.2v-7.9z"/><path d="m62.7.5c0-.2.2-.4.4-.4h5.4c2.3 0 4.1 1.8 4.1 4.1 0 1.7-1.2 3.2-2.8 3.8l2.6 4.8c.1.2 0 .5-.3.5h-2c-.2 0-.3-.1-.3-.2l-2.5-5h-2.1v4.8c0 .2-.2.4-.4.4h-1.7c-.2 0-.4-.2-.4-.4zm5.6 5.7c1 0 1.9-.9 1.9-1.9s-.9-1.8-1.9-1.8h-3.1v3.8h3.1z"/><path d="m73.6 12.9 5.9-12.7c0-.1.1-.2.3-.2h.2c.2 0 .3.1.3.2l5.8 12.7c.1.2 0 .5-.3.5h-1.6c-.3 0-.4-.1-.5-.4l-.9-2h-5.8l-.9 2c-.1.2-.2.4-.5.4h-1.6c-.4 0-.5-.2-.4-.5m8.2-4-1.9-4.2h-.1l-1.8 4.2z"/><path d="m87.8.5c0-.2.2-.4.3-.4h4.5c3.7 0 6.6 3 6.6 6.6 0 3.7-3 6.6-6.6 6.6h-4.5c-.2 0-.3-.2-.3-.4zm4.6 10.6c2.5 0 4.3-1.9 4.3-4.3 0-2.5-1.8-4.3-4.3-4.3h-2.2v8.6z"/><path d="m107.7 0c3.8 0 6.8 3 6.8 6.8s-3 6.8-6.8 6.8-6.8-3-6.8-6.8 3-6.8 6.8-6.8m0 11.2c2.4 0 4.4-1.9 4.4-4.3s-2-4.4-4.4-4.4-4.3 2-4.3 4.4c-.1 2.3 1.9 4.3 4.3 4.3"/><path d="m116.9.5c0-.2.2-.4.4-.4h5.4c2.3 0 4.1 1.8 4.1 4.1 0 1.7-1.2 3.2-2.8 3.8l2.6 4.8c.1.2 0 .5-.3.5h-2c-.2 0-.3-.1-.3-.2l-2.5-5h-2.1v4.8c0 .2-.2.4-.4.4h-1.7c-.2 0-.4-.2-.4-.4zm5.6 5.7c1 0 1.9-.9 1.9-1.9s-.9-1.8-1.9-1.8h-3.1v3.8h3.1z"/><path d="m127.8 12.9 5.9-12.7c.1-.1.2-.2.3-.2h.2c.2 0 .3.1.3.2l5.8 12.7c.1.2 0 .5-.3.5h-1.6c-.3 0-.4-.1-.5-.4l-.9-2h-5.7l-.9 2c-.1.2-.2.4-.5.4h-1.6c-.4 0-.6-.2-.5-.5m8.2-4-1.9-4.2h-.1l-1.9 4.2z"/></g></svg>`;

const ICON_PHONE = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.25 1.02l-2.2 2.2Z"/></svg>`;

const ICON_GLOBE = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9s1.3-6.3 3.8-9Z"/></svg>`;

const ICON_FACEBOOK = `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="22" height="22" rx="5" fill="#fff"/><path d="M15.4 8.6h-1.6c-.2 0-.4.2-.4.5v1.7h2l-.3 2.1h-1.7V19h-2.4v-6.1H9.5v-2.1H11V8.8c0-1.7 1-2.9 2.7-2.9h1.7v2.7Z" fill="#d8132e"/></svg>`;

const ICON_INSTAGRAM = `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="22" height="22" rx="6" fill="#fff"/><rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="#d8132e" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="none" stroke="#d8132e" stroke-width="1.6"/><circle cx="16.3" cy="7.7" r="1" fill="#d8132e"/></svg>`;

const ICON_LINKEDIN = `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="22" height="22" rx="5" fill="#fff"/><path d="M7.8 10.2h2.2V18H7.8v-7.8Zm1.1-3.5c.7 0 1.3.6 1.3 1.3S9.6 9.3 8.9 9.3s-1.3-.6-1.3-1.3.6-1.3 1.3-1.3Zm2.9 3.5h2.1v1.07h.03c.3-.55 1.02-1.13 2.1-1.13 2.24 0 2.66 1.47 2.66 3.39V18h-2.2v-3.55c0-.85-.02-1.94-1.18-1.94-1.18 0-1.36.92-1.36 1.88V18h-2.2v-7.8Z" fill="#d8132e"/></svg>`;

const ICON_STOREFRONT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M3 4h18l1.5 5a2.5 2.5 0 0 1-4 2v9h-3v-6H8.5v6h-3v-9a2.5 2.5 0 0 1-4-2Z"/></svg>`;

export const BASE_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Arial', 'Helvetica', sans-serif;
    color: #1a1a1a;
    font-size: 13px;
  }
  .page {
    position: relative;
    width: 210mm;
    page-break-after: always;
  }
  .page:last-child { page-break-after: avoid; }
  .body { padding: 0 10mm; }
  .meta-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4mm;
    font-size: 12.5px;
  }
  .meta-row .plan-name { font-size: 18px; font-weight: 700; color: #1a1a1a; }
  .cliente-banner {
    background: none;
    color: #1a1a1a;
    padding: 2.5mm 4mm;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 5mm;
  }
  .title {
    font-size: 23px;
    font-weight: 300;
    margin: 0 0 4mm 0;
  }
  .title strong { color: #d8132e; font-weight: 700; }
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6mm;
  }
  table.data-table tr:nth-child(odd) td { background: #f4f3f1; }
  table.data-table td {
    padding: 3mm 4mm;
    font-size: 12.5px;
  }
  table.data-table td:first-child { color: #1a1a1a; width: 45%; }
  table.data-table td:last-child { font-weight: 600; }
  table.sumas-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6mm;
    border: 1px solid #ddd;
  }
  table.sumas-table th {
    background: #d8132e;
    color: #fff;
    text-align: left;
    padding: 3mm;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
  }
  table.sumas-table th:not(:first-child) { text-align: right; }
  table.sumas-table td {
    padding: 2.5mm 3mm;
    font-size: 12px;
    border-top: 1px solid #eee;
  }
  table.sumas-table td:not(:first-child) { text-align: right; }
  tr.sumas-table__total td {
    font-weight: 700;
    border-top: 2px solid #1a1a1a;
  }
  .section-title {
    font-size: 18px;
    font-weight: 300;
    margin: 0 0 3mm 0;
  }
  .section-title strong { color: #d8132e; font-weight: 700; }
  table.plan-pago {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 5mm;
    border: 1px solid #ddd;
  }
  table.plan-pago th {
    background: #d8132e;
    color: #fff;
    text-align: center;
    padding: 3mm;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
  }
  table.plan-pago td {
    padding: 3mm;
    font-size: 12.5px;
    border-top: 1px solid #eee;
    text-align: center;
  }
  table.plan-pago td:first-child,
  table.plan-pago th:first-child { text-align: left; }
  table.plan-pago tr.total td { font-weight: 700; border-top: 2px solid #1a1a1a; }
  .variante-label {
    display: inline-block;
    background: linear-gradient(180deg, #d8132e 0%, #7a0f11 100%);
    color: #fff;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1.5mm 3mm;
    margin-bottom: 2mm;
  }
  .agente-box {
    border: 1px solid #ddd;
    padding: 3mm 5mm;
    text-align: center;
    width: 60mm;
    margin: 6mm auto 3mm auto;
    font-size: 11.5px;
  }
  .footer-legal {
    text-align: center;
    font-size: 10.5px;
    color: #8a8a8a;
    margin-top: 4mm;
  }
  .cols {
    column-count: 2;
    column-gap: 8mm;
    column-fill: auto;
  }
  .cols-flex {
    display: flex;
    gap: 8mm;
  }
  .cols-flex .col {
    flex: 1;
    min-width: 0;
  }
  .card-block {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 5mm;
  }
  /* A diferencia de los demás bloques (atómicos: saltan enteros a la siguiente columna/hoja si
     no entran), "Coberturas cotizadas" puede ser larga y variable — se deja fluir: arranca
     debajo de "Coberturas principales incluidas" en la misma columna y, si no entra completa,
     continúa en la columna siguiente en vez de dejar hueco en blanco. Cada cobertura individual
     (.cobertura-item) sigue sin poder partirse a la mitad. */
  .card-block--flow {
    break-inside: auto;
    page-break-inside: auto;
  }
  .card-title {
    background: linear-gradient(180deg, #d8132e 0%, #7a0f11 100%);
    color: #fff;
    font-size: 12.5px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2.5mm 4mm;
    margin-bottom: 2mm;
    break-after: avoid;
    page-break-after: avoid;
  }
  .cobertura-item {
    padding: 2.5mm 0;
    border-bottom: 1px solid #eee;
    font-size: 12px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .cobertura-item .nombre { font-weight: 700; }
  .cobertura-item .monto { color: #8a8a8a; }
  .cobertura-item__legal {
    font-size: 10.5px;
    color: #1a1a1a;
    line-height: 1.4;
    margin-top: 1mm;
  }
  .cobertura-item__legal--exclusiones { color: #8a8a8a; font-style: italic; font-size: 9.5px; }
  .badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.5mm 1.5mm;
    border-radius: 2px;
    margin-right: 2mm;
  }
  .badge--cobertura { background: #e9f7ee; color: #1e8a4c; }
  .badge--sublimite { background: #fbeaea; color: #d8132e; }
  .legal-block { font-size: 11px; margin-bottom: 4mm; white-space: pre-line; line-height: 1.5; }
  .legal-block .subtitle { font-weight: 700; font-size: 12px; margin-bottom: 1mm; color: #1a1a1a; }
`;

/**
 * @param {{ramoLabel: string, body: string}[]} pages - contenido ya armado por página
 */
export function renderOferta({ ramoLabel, pages }) {
  const pagesHtml = pages
    .map(
      (bodyHtml) => `
    <div class="page">
      <div class="body">${bodyHtml}</div>
    </div>
  `
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>${BASE_CSS}</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

// headerTemplate/footerTemplate de Puppeteer corren en un contexto aislado (no comparten
// BASE_CSS ni el <body> del documento) pero SÍ se repiten en cada hoja física del PDF —
// a diferencia de dibujar header/footer dentro de cada .page, que solo aparece una vez por
// página lógica y deja hojas de overflow sin marca cuando el contenido no entra en una sola
// hoja. Los márgenes de page.pdf() deben coincidir con el alto real de estos bloques.
export const OFERTA_MARGIN = { top: '26mm', bottom: '15mm', left: '0', right: '0' };

// Alto útil de contenido por hoja física (A4 = 297mm) descontando el header/footer fijo de
// Puppeteer — usado para decidir si el layout de columnas 3/3 forzado entra en una sola hoja
// antes de generar el PDF final (ver measureContentHeightMm en pdf.service.js).
export const OFERTA_PAGE_HEIGHT_MM = 297 - 26 - 15;

export function buildHeaderTemplate(ramoLabel) {
  // position:fixed + top:0 ancla la barra al borde real de la hoja — sin esto, Chrome deja
  // cualquier margen sobrante (margin-top más alto que el contenido) pegado ARRIBA de la
  // barra en vez de entre la barra y el cuerpo, dejando un hueco blanco antes del header.
  return `
    <style>* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style>
    <div style="position:fixed; top:0; left:0; right:0; width:100%; background:#d8132e; display:flex; justify-content:space-between; align-items:center; padding:4mm 10mm; font-size:13px;">
      <div style="display:flex; align-items:center; gap:16px;">
        ${TAJY_LOGO_SVG}
        <div style="color:#fff;">
          <div style="font-size:14px; font-weight:700; letter-spacing:0.5px;">ASEGURADORA TAJY</div>
          <div style="font-size:10px; opacity:0.9; margin-top:2px;">Viví <strong>seguro</strong>, viví <strong>mejor</strong>.</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; color:#fff; font-size:12px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">
        ${ICON_STOREFRONT}${escapeHtml(ramoLabel)}
      </div>
    </div>
  `;
}

export function buildFooterTemplate() {
  // position:fixed + bottom:0 ancla la barra al borde real de la hoja — mismo motivo que en
  // buildHeaderTemplate, pero pegado abajo.
  return `
    <style>* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style>
    <div style="position:fixed; bottom:0; left:0; right:0; width:100%; background:#d8132e; color:#fff; display:flex; align-items:center; justify-content:space-around; font-size:11px; font-weight:700; padding:2.5mm 10mm;">
      <div style="display:flex; align-items:center; gap:5px;">${ICON_PHONE} (021) 689-1000</div>
      <div style="display:flex; align-items:center; gap:5px;">${ICON_GLOBE} www.tajy.com.py</div>
      <div style="display:flex; align-items:center; gap:5px;">
        <span style="display:flex; align-items:center; gap:4px;">${ICON_FACEBOOK}${ICON_INSTAGRAM}${ICON_LINKEDIN}</span>
        Aseguradora Tajy
      </div>
    </div>
  `;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function fmtGs(value) {
  return Math.round(Number(value) || 0).toLocaleString('es-PY');
}

export function fmtFecha(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
