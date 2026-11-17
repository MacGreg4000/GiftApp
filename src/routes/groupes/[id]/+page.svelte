<script lang="ts">
	import Header from '#lib/components/Header.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import ThemeArt from '#lib/components/ThemeArt.svelte';
	import { ACCENT_COLORS, LIST_THEMES, THEME_LABELS } from '#lib/palette';
	import { daysUntil, formatEventDate } from '#lib/format';

	let { data, form } = $props();
	const accent = $derived(ACCENT_COLORS[data.group.accent] ?? ACCENT_COLORS.brique);
	let box = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (form?.message && box && !box.open) box.showModal();
	});
</script>

<svelte:head><title>{data.group.name} — Nos Souhaits</title></svelte:head>
<Header name={data.user?.displayName ?? ''} active="groupes" />
<main class="page">
	<p class="crumb"><a href="/accueil">Mes groupes</a> · {data.group.name}</p>
	<h1 class="serif" style="font-size:3rem;margin:8px 0">{data.group.name}</h1>
	<p class="sub">{data.group.memberCount} membres · {data.group.listCount} liste{data.group.listCount > 1 ? 's' : ''} en cours</p>
	<div class="split">
		<section>
			<div class="section-head">
				<h2>Nos listes</h2>
				<button class="btn small" type="button" onclick={() => box?.showModal()}>+ Nouvelle liste</button>
			</div>
			{#if form?.message}<p class="alert">{form.message}</p>{/if}
			{#if data.group.lists.length === 0}
				<article class="group-card">
					<div class="group-head" style:background={accent.header}>
						<div class="stars"></div>
						<div>
							<h2>Rien de prévu</h2>
							<p>Noël, Saint-Nicolas, un anniversaire.</p>
						</div>
					</div>
					<p class="empty-inline">N’importe quel membre peut ouvrir une liste. Les autres y ajoutent leurs souhaits, sauf si elle concerne une seule personne.</p>
				</article>
			{/if}
			<div class="cards">
				{#each data.group.lists as list}
					<a class="theme-card" href="/listes/{list.id}">
						<div class="theme-card-art">
							<ThemeArt theme={list.theme} />
							<span class="theme-pill">{THEME_LABELS[list.theme] ?? 'Liste'}</span>
						</div>
						<div class="theme-card-body">
							<h3 class="serif">{list.title}</h3>
							<p class="quiet">
								{#if list.recipientName}Pour {list.recipientName}{:else}Pour tout le monde{/if}
								· {formatEventDate(list.eventDate)}
								{#if daysUntil(list.eventDate)} · {daysUntil(list.eventDate)}{/if}
							</p>
							<p>
								{list.wishCount} souhait{list.wishCount > 1 ? 's' : ''}
								{#if list.progress} · {list.progress.taken} sur {list.progress.total} déjà pris{/if}
							</p>
						</div>
					</a>
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

<dialog class="sheet" bind:this={box} aria-labelledby="list-dialog-title">
	<form class="sheet-body" method="post" action="?/createList">
		<div class="sheet-head">
			<h2 id="list-dialog-title" class="serif">Nouvelle liste</h2>
			<button class="close-x" type="button" onclick={() => box?.close()} aria-label="Fermer">×</button>
		</div>
		<label>Nom<input name="title" required maxlength="100" placeholder="Noël 2026" /></label>
		<label>Thème
			<select name="theme">
				{#each LIST_THEMES as theme}
					<option value={theme.id}>{theme.label}</option>
				{/each}
			</select>
		</label>
		<label>Date <span class="quiet">facultative</span><input name="eventDate" type="date" /></label>
		<label>Personne concernée <span class="quiet">facultative</span>
			<select name="recipientId">
				<option value="">Tout le monde — chacun ajoute les siens</option>
				{#each data.group.members as member}
					<option value={member.id}>{member.displayName}</option>
				{/each}
			</select>
		</label>
		<p class="quiet">Si une personne est choisie, seule elle peut y déposer des souhaits.</p>
		<button class="btn" type="submit">Créer la liste</button>
	</form>
</dialog>
