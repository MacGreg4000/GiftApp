<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import HeroArt from '#lib/components/HeroArt.svelte';
	import PinInput from '#lib/components/PinInput.svelte';
	import { initial, avatarColor } from '#lib/palette';

	let { data, form } = $props();
	let prenom = $state(untrack(() => form?.prenom ?? data.remembered ?? ''));
	let saved = $state<string[]>([]);

	onMount(() => {
		try {
			const raw = JSON.parse(localStorage.getItem('ns.prenoms') ?? '[]');
			if (Array.isArray(raw)) saved = raw.filter((item) => typeof item === 'string').slice(0, 8);
		} catch {
			saved = [];
		}
	});
</script>

<svelte:head>
	<title>Connexion — Nos Souhaits</title>
</svelte:head>

<div class="login-shell">
	<section class="hero">
		<div class="hero-stars" aria-hidden="true"></div>
		<a class="brand" href="/">
			<span class="logo-mark" aria-hidden="true">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
					<rect x="3" y="10" width="18" height="11" rx="2" fill="#b8322a" />
					<path d="M12 10v11" stroke="#f6d7a2" stroke-width="2" />
					<path d="M3.5 10h17" stroke="#f6d7a2" stroke-width="2" />
					<path d="M12 10c-2-4-6-4-6-1.5S10 10 12 10c2-4 6-4 6-1.5S14 10 12 10z" fill="#e8b15a" />
				</svg>
			</span>
			Nos Souhaits
		</a>
		<div class="hero-copy">
			<h1>Le plaisir d’offrir, <em>sans jamais gâcher</em> la surprise.</h1>
		</div>
		<div class="hero-art">
			<HeroArt />
		</div>
	</section>
	<section class="login-panel">
		<p class="eyebrow">Bienvenue</p>
		<h2>Bonjour, qui êtes-vous ?</h2>
		<p class="lede">Le prénom affiché par l’organisateur, tiret compris, puis le code à six chiffres.</p>
		{#if form?.message}
			<p class="alert" role="alert">{form.message}</p>
		{/if}
		<form method="post" use:enhance>
			<label class="field">
				<span>Votre prénom</span>
				<div class="name-input">
					{#if prenom.trim()}
						<span class="avatar" style:background={avatarColor(prenom)}>{initial(prenom)}</span>
					{/if}
					<input
						name="prenom"
						bind:value={prenom}
						list="prenoms-locaux"
						autocomplete="username"
						required
						placeholder="Votre prénom"
					/>
				</div>
				<small class="hint">
					{#if saved.length}
						Sur cet appareil, vous pouvez reprendre un prénom déjà utilisé. Aucune liste n’est publique.
					{:else}
						Saisissez le prénom indiqué par l’organisateur. Il n’y a pas de liste publique.
					{/if}
				</small>
			</label>
			<datalist id="prenoms-locaux">
				{#each saved as name}
					<option value={name}></option>
				{/each}
			</datalist>
			<div class="field">
				<span>Votre code personnel</span>
				<PinInput />
			</div>
			<button class="btn wide" type="submit">Entrer</button>
		</form>
		<p class="secure-note">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8" />
				<path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8" />
			</svg>
			Connexion sécurisée : après cinq codes incorrects, l’accès est suspendu quinze minutes.
		</p>
		<p class="login-foot">
			Vous organisez ?
			<a href={data.adminPath}>Accès administrateur</a>
		</p>
	</section>
</div>
