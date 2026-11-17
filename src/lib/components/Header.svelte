<script lang="ts">
	import Avatar from './Avatar.svelte';

	let {
		admin = false,
		name,
		adminPath = '/gestion',
		active = 'groupes'
	}: {
		admin?: boolean;
		name: string;
		adminPath?: string;
		active?: string;
	} = $props();
</script>

<header class="topbar">
	<a class="brand" href={admin ? adminPath : '/accueil'}>
		<span class="logo-mark" aria-hidden="true">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
				<rect x="3" y="10" width="18" height="11" rx="2" fill="#b8322a" />
				<path d="M12 10v11" stroke="#f6d7a2" stroke-width="2" />
				<path d="M3.5 10h17" stroke="#f6d7a2" stroke-width="2" />
				<path d="M12 10c-2-4-6-4-6-1.5S10 10 12 10c2-4 6-4 6-1.5S14 10 12 10z" fill="#e8b15a" />
			</svg>
		</span>
		Nos Souhaits
		{#if admin}<span class="admin-badge">Admin</span>{/if}
	</a>
	<nav class="nav" aria-label="Navigation">
		{#if admin}
			<a href={adminPath} aria-current={active === 'groupes' ? 'page' : undefined}>Groupes</a>
			<a href="{adminPath}/listes" aria-current={active === 'listes' ? 'page' : undefined}>Listes</a>
			<a href="{adminPath}/sauvegardes" aria-current={active === 'sauvegardes' ? 'page' : undefined}>Sauvegardes</a>
			<a href="{adminPath}/journal" aria-current={active === 'journal' ? 'page' : undefined}>Journal</a>
			<a href="{adminPath}/parametres" aria-current={active === 'parametres' ? 'page' : undefined}>Paramètres</a>
		{:else}
			<a href="/accueil" aria-current={active === 'groupes' ? 'page' : undefined}>Mes groupes</a>
			<a href="/souhaits" aria-current={active === 'souhaits' ? 'page' : undefined}>Mes souhaits</a>
		{/if}
	</nav>
	<div class="who">
		<span>{name}</span>
		<Avatar {name} />
		<form method="post" action="/deconnexion">
			<button class="linkish" type="submit">Se déconnecter</button>
		</form>
	</div>
</header>
