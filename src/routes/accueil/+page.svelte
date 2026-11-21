<script lang="ts">
	import { onMount } from 'svelte';
	import Header from '#lib/components/Header.svelte';
	import { ACCENT_COLORS, THEME_LABELS } from '#lib/palette';
	import Avatar from '#lib/components/Avatar.svelte';
	import { daysUntil, formatEventDate } from '#lib/format';

	let { data } = $props();

	onMount(() => {
		const name = data.greeting.accent;
		try {
			const current = JSON.parse(localStorage.getItem('ns.prenoms') ?? '[]');
			const list = Array.isArray(current) ? current.filter((item) => typeof item === 'string') : [];
			const next = [name, ...list.filter((item) => item !== name)].slice(0, 8);
			localStorage.setItem('ns.prenoms', JSON.stringify(next));
		} catch {
			/* navigation privée */
		}
	});
</script>

<svelte:head><title>Accueil — Nos Souhaits</title></svelte:head>
<Header name={data.greeting.accent} active="groupes" />
<main class="page">
	<header class="greeting">
		<p class="eyebrow day">{data.day}</p>
		<h1>{data.greeting.lead}<em>{data.greeting.accent}</em>{data.greeting.tail}</h1>
		<p class="sub">Voici vos groupes et les listes de vos proches.</p>
	</header>
	{#if data.groups.length === 0}
		<section class="group-card">
			<div class="empty-inline">
				<p>Vous n’êtes dans aucun groupe pour le moment.</p>
				<p class="quiet">Dès que l’organisateur vous ajoute, vos listes apparaîtront ici.</p>
			</div>
		</section>
	{/if}
	{#each data.groups as group}
		{@const accent = ACCENT_COLORS[group.accent] ?? ACCENT_COLORS.brique}
		<article class="group-card">
			<div class="group-head" style:background={accent.header} style:color={accent.ink}>
				<div class="stars" aria-hidden="true"></div>
				<div>
					<h2><a href="/groupes/{group.id}">{group.name}</a></h2>
					<p>{group.memberCount} membre{group.memberCount > 1 ? 's' : ''} · {group.listCount} liste{group.listCount > 1 ? 's' : ''} en cours</p>
				</div>
				<div class="avatar-row" aria-label="Membres">
					{#each group.members.slice(0, 6) as member}
						<Avatar name={member.displayName} />
					{/each}
					{#if group.members.length > 6}
						<span class="avatar-more">+{group.members.length - 6}</span>
					{/if}
				</div>
			</div>
			{#if group.lists.length === 0}
				<p class="empty-inline">Aucune liste pour l’instant, l’admin en créera une.</p>
			{/if}
			{#each group.lists as list}
				<a class="list-row" href="/listes/{list.id}">
					<span class="avatar" style:background={accent.header}>{list.title.charAt(0)}</span>
					<span>
						<span class="list-kicker">{THEME_LABELS[list.theme] ?? 'Liste'}</span>
						<strong>{list.title}</strong>
					</span>
					<span class="when quiet">
						{formatEventDate(list.eventDate)}
						{#if daysUntil(list.eventDate)}<br />{daysUntil(list.eventDate)}{/if}
					</span>
					<span class="progress">
						{#if list.progress}
							{list.progress.taken} sur {list.progress.total} déjà pris
							<span class="bar"><span style:width="{Math.min(100, (list.progress.taken / list.progress.total) * 100)}%"></span></span>
						{:else}
							<span class="quiet">Vos souhaits restent secrets</span>
						{/if}
					</span>
					<span class="chev" aria-hidden="true">→</span>
				</a>
			{/each}
		</article>
	{/each}
	<p class="page-foot">Les cadeaux réservés apparaissent comme « pris » — personne ne sait par qui.</p>
</main>
