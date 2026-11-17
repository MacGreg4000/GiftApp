<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let copied = $state(false);

	async function copyCodes() {
		if (!form?.codes) return;
		await navigator.clipboard.writeText(form.codes.join('\n'));
		copied = true;
	}
</script>

<svelte:head><title>Installation — Nos Souhaits</title></svelte:head>

<main class="login-shell">
	<section class="hero">
		<div class="hero-stars"></div>
		<a class="brand" href="/installation">
			<span class="logo-mark" aria-hidden="true">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
					<rect x="3" y="10" width="18" height="11" rx="2" fill="#b8322a" />
					<path d="M12 10v11" stroke="#f6d7a2" stroke-width="2" />
					<path d="M12 10c-2-4-6-4-6-1.5S10 10 12 10c2-4 6-4 6-1.5S14 10 12 10z" fill="#e8b15a" />
				</svg>
			</span>
			Nos Souhaits
		</a>
		<div class="hero-copy">
			<h1>Première mise en route, <em>rien que pour vous</em>.</h1>
		</div>
	</section>
	<section class="login-panel">
		{#if form?.codes}
			<p class="eyebrow">Codes de secours</p>
			<h2>Notez-les maintenant</h2>
			<p class="lede">Ces dix codes remplacent l’application d’authentification. Ils ne seront plus affichés.</p>
			<div class="pin-banner">
				{#each form.codes as code}
					<div><strong style="letter-spacing:0.08em;font-size:1.3rem">{code}</strong></div>
				{/each}
			</div>
			<button class="btn soft" type="button" onclick={copyCodes}>{copied ? 'Copiés' : 'Copier les codes'}</button>
			<form method="post" action="?/finish" use:enhance>
				<button class="btn wide" type="submit">J’ai mis ces codes en lieu sûr</button>
			</form>
		{:else if data.step === 'totp'}
			<p class="eyebrow">Authentification</p>
			<h2>Reliez une application</h2>
			<p class="lede">Scannez ce QR code avec Aegis, 1Password ou Google Authenticator, puis entrez le code à 6 chiffres.</p>
			{#if form?.message}<p class="alert" role="alert">{form.message}</p>{/if}
			<div class="pin-banner">{@html data.qr}</div>
			<p class="quiet">Saisie manuelle : <code>{data.secret}</code></p>
			<form method="post" action="?/confirm" class="stack" use:enhance>
				<label>
					Code à 6 chiffres
					<input name="code" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6}" />
				</label>
				<button class="btn" type="submit">Vérifier</button>
			</form>
		{:else}
			<p class="eyebrow">Compte organisateur</p>
			<h2>Créer l’accès admin</h2>
			<p class="lede">
				Une phrase de passe d’au moins 14 caractères, puis un code à usage unique. Le code d’installation est dans les journaux du conteneur.
			</p>
			{#if form?.message}<p class="alert" role="alert">{form.message}</p>{/if}
			<form method="post" action="?/account" class="stack" use:enhance>
				<label>
					Nom du compte
					<input name="username" required minlength="2" maxlength="40" placeholder="Grégory" autocomplete="username" />
				</label>
				<label>
					Code d’installation
					<input name="setupCode" required autocomplete="off" />
				</label>
				<label>
					Phrase de passe
					<input name="password" type="password" required minlength="14" autocomplete="new-password" />
				</label>
				<label>
					Confirmation
					<input name="confirm" type="password" required minlength="14" autocomplete="new-password" />
				</label>
				<button class="btn" type="submit">Continuer</button>
			</form>
		{/if}
	</section>
</main>
