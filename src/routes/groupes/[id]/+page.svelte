<script lang="ts">
	import Header from '#lib/components/Header.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { ACCENT_COLORS, THEME_LABELS } from '#lib/palette';
	import { daysUntil, formatEventDate } from '#lib/format';

	let { data } = $props();
	const accent = $derived(ACCENT_COLORS[data.group.accent] ?? ACCENT_COLORS.brique);
</script>

<svelte:head><title>{data.group.name} — Nos Souhaits</title></svelte:head>
<Header name={data.user?.displayName ?? ''} active="groupes" />
<main class="page">
	<p class="crumb"><a href="/accueil">Mes groupes</a> · {data.group.name}</p>
	<h1 class="serif" style="font-size:3rem;margin:8px 0">{data.group.name}</h1>
	<p class="sub">{data.group.memberCount} membres · {data.group.listCount} liste{data.group.listCount > 1 ? 's' : ''} en cours</p>
	<div class="split">
		<section>
			<h2>Nos listes</h2>
			{#if data.group.lists.length === 0}
				<article class="group-card">
					<div class="group-head" style:background={accent.header}>
						<div class="stars"></div>
						<div>
							<h2>Bientôt</h2>
							<p>Les listes de souhaits s’ajouteront ici.</p>
						</div>
					</div>
					<p class="empty-inline">
						Votre accès est prêt. La création des listes arrive à l’étape suivante : Noël, Saint-Nicolas, anniversaires.
					</p>
				</article>
			{/if}
			<div class="cards">
				{#each data.group.lists as list}
					<article class="mini-card">
						<p class="list-kicker">{THEME_LABELS[list.theme] ?? 'Liste'}</p>
						<h3 class="serif" style="margin:6px 0">{list.title}</h3>
						<p class="quiet">{formatEventDate(list.eventDate)}{#if daysUntil(list.eventDate)} · {daysUntil(list.eventDate)}{/if}</p>
						{#if list.progress}
							<p>{list.progress.taken} sur {list.progress.total} déjà pris</p>
						{/if}
					</article>
				{/each}
			</div>
		</section>
		<aside class="panel">
			<h3>Membres <span class="quiet">{data.group.memberCount}</span></h3>
			{#each data.group.members as member}
				<div class="member-line">
					<Avatar name={member.displayName} />
					<span class="grow">{member.displayName} {#if member.label}<small class="quiet">{member.label}</small>{/if}</span>
				</div>
			{/each}
		</aside>
	</div>
</main>
