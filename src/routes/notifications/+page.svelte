<script lang="ts">
	import { enhance } from '$app/forms';
	import Header from '#lib/components/Header.svelte';

	let { data, form } = $props();
	let ios = $state(false);
	let standalone = $state(false);
	let endpoint = $state('');
	let p256dh = $state('');
	let auth = $state('');
	let localError = $state('');
	let subscribeForm = $state<HTMLFormElement | null>(null);

	$effect(() => {
		const ua = navigator.userAgent;
		ios = /iPad|iPhone|iPod/.test(ua);
		const nav = navigator as Navigator & { standalone?: boolean };
		standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
	});

	function keyBytes(value: string) {
		const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
		const raw = atob(padded);
		const bytes = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
		return bytes;
	}

	async function enable() {
		localError = '';
		if (!data.configured || !data.publicKey) {
			localError = 'Les notifications ne sont pas activées sur ce serveur.';
			return;
		}
		if (ios && !standalone) {
			localError = 'Sur iPhone, ouvrez d’abord Nos Souhaits depuis l’icône de l’écran d’accueil.';
			return;
		}
		if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
			localError = 'Ce navigateur ne reçoit pas les notifications.';
			return;
		}
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			localError = 'La permission a été refusée. Vous pouvez la réautoriser dans les réglages du navigateur.';
			return;
		}
		const registration = await navigator.serviceWorker.register('/sw.js');
		await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: keyBytes(data.publicKey)
		});
		const json = subscription.toJSON();
		endpoint = subscription.endpoint;
		p256dh = json.keys?.p256dh ?? '';
		auth = json.keys?.auth ?? '';
		subscribeForm?.requestSubmit();
	}

	async function disable() {
		const registration = await navigator.serviceWorker?.getRegistration();
		const subscription = await registration?.pushManager.getSubscription();
		if (subscription) {
			endpoint = subscription.endpoint;
			await subscription.unsubscribe();
		}
	}
</script>

<svelte:head><title>Alertes — Nos Souhaits</title></svelte:head>
<Header name={data.name} active="alertes" />
<main class="page">
	<p class="crumb"><a href="/accueil">Mes groupes</a></p>
	<h1 class="serif">Alertes</h1>
	<p class="sub">Un rappel utile, jamais le nom de qui a pris un cadeau, ni le montant d’une part.</p>
	{#if form?.message}<p class="alert">{form.message}</p>{/if}
	{#if localError}<p class="alert">{localError}</p>{/if}

	<section class="table-card">
		<h2>Sur iPhone</h2>
		<p>
			Les notifications web demandent iOS 16.4 ou plus récent, et l’application doit être ouverte depuis l’écran d’accueil.
		</p>
		<ol>
			<li>Dans Safari, touchez le bouton Partager.</li>
			<li>Choisissez « Sur l’écran d’accueil », puis Ajouter.</li>
			<li>Ouvrez Nos Souhaits depuis cette icône.</li>
			<li>Revenez ici et touchez « Activer sur cet appareil ».</li>
		</ol>
		{#if ios && !standalone}
			<p class="quiet">Vous êtes dans Safari. L’activation reste bloquée tant que l’icône n’est pas utilisée.</p>
		{/if}
	</section>

	<section class="table-card">
		<h2>Cet appareil</h2>
		{#if !data.configured}
			<p>Les notifications ne sont pas activées sur ce serveur. L’administrateur peut ajouter les clés VAPID dans le fichier d’environnement.</p>
		{:else}
			<button class="btn" type="button" onclick={enable} disabled={ios && !standalone}>Activer sur cet appareil</button>
			<form method="post" action="?/subscribe" bind:this={subscribeForm} use:enhance class="hidden-form">
				<input type="hidden" name="endpoint" value={endpoint} />
				<input type="hidden" name="p256dh" value={p256dh} />
				<input type="hidden" name="auth" value={auth} />
			</form>
			<form method="post" action="?/unsubscribe" use:enhance>
				<input type="hidden" name="endpoint" value={endpoint} />
				<button class="btn ghost" type="submit" onclick={disable}>Couper sur cet appareil</button>
			</form>
		{/if}
	</section>

	<section class="table-card">
		<h2>Ce que vous voulez recevoir</h2>
		<form method="post" action="?/prefs" class="stack" use:enhance>
			<label class="choice"><input type="checkbox" name="newList" value="1" checked={data.prefs.new_list} /> Une nouvelle liste dans le groupe</label>
			<label class="choice"><input type="checkbox" name="newWish" value="1" checked={data.prefs.new_wish} /> Un nouveau souhait (désactivé par défaut)</label>
			<label class="choice"><input type="checkbox" name="sharedFunded" value="1" checked={data.prefs.shared_funded} /> Un cadeau commun est financé</label>
			<label class="choice"><input type="checkbox" name="eventReminder" value="1" checked={data.prefs.event_reminder} /> Rappel 7 jours avant, puis la veille</label>
			<button class="btn" type="submit">Enregistrer</button>
		</form>
		<p class="quiet">Rien n’est envoyé au propriétaire d’un souhait à propos d’une réservation ou d’une cagnotte. Les textes ne citent ni un acheteur, ni une part.</p>
	</section>
</main>

<style>
	ol { padding-left: 1.2rem; }
	.hidden-form { position: absolute; width: 1px; height: 1px; overflow: hidden; }
</style>
