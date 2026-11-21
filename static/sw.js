self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let payload = { title: 'Nos Souhaits', body: '', url: '/accueil' };
	try {
		const data = event.data ? event.data.json() : {};
		if (data && typeof data === 'object') payload = { ...payload, ...data };
	} catch {
		payload.body = '';
	}
	const url = typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//')
		? payload.url
		: '/accueil';
	const title = String(payload.title || 'Nos Souhaits').slice(0, 80);
	const body = String(payload.body || '').slice(0, 180);
	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			data: { url }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/accueil';
	event.waitUntil(self.clients.openWindow(url));
});
