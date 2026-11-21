<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Header from '#lib/components/Header.svelte';
	import ThemeArt from '#lib/components/ThemeArt.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { LIST_THEMES, THEME_LABELS, themeArt } from '#lib/palette';
	import { daysUntil, formatEventDate } from '#lib/format';
	import { reservationText } from '#lib/reservation-label';

	let { data, form } = $props();
	type ListedWish = (typeof data.page.wishes)[number];
	const art = $derived(themeArt(data.page.theme));
	const sections = $derived.by(() => {
		const groups = new Map<string, { id: string; name: string; label: string | null; wishes: ListedWish[] }>();
		for (const member of data.page.members) {
			groups.set(member.id, { id: member.id, name: member.displayName, label: member.label, wishes: [] });
		}
		for (const wish of data.page.wishes) {
			const section = groups.get(wish.ownerId) ?? {
				id: wish.ownerId,
				name: wish.ownerName,
				label: wish.ownerLabel,
				wishes: []
			};
			section.wishes.push(wish);
			groups.set(wish.ownerId, section);
		}
		return [...groups.values()].filter((section) => section.wishes.length > 0);
	});

	let filter = $state('tous');
	const visible = $derived(
		sections.filter((section) => {
			if (filter === 'tous') return true;
			if (filter === 'moi') return section.id === data.page.viewerId;
			return section.id === filter;
		})
	);

	let box = $state<HTMLDialogElement | null>(null);
	let editing = $state<ListedWish | null>(null);
	let title = $state('');
	let link = $state('');
	let description = $state('');
	let priority = $state(2);
	let surprise = $state(false);
	let preview = $state<{ title: string | null; siteName: string | null; photoId: string | null } | null>(null);
	let saving = $state(false);
	let requestKey = $state('');

	function openNew() {
		editing = null;
		title = '';
		link = '';
		description = '';
		priority = 2;
		surprise = false;
		preview = null;
		saving = false;
		requestKey = crypto.randomUUID();
		box?.showModal();
	}

	function openEdit(wish: ListedWish) {
		editing = wish;
		title = wish.title;
		link = wish.url ?? '';
		description = wish.description ?? '';
		priority = wish.priority;
		surprise = wish.isSurprise;
		preview = null;
		box?.showModal();
	}

	const onWishForm: SubmitFunction = ({ cancel }) => {
		if (saving) {
			cancel();
			return;
		}
		saving = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && result.data && typeof result.data === 'object' && 'preview' in result.data) {
					const next = (result.data as { preview?: typeof preview }).preview ?? null;
					if (next?.title && !title.trim()) title = next.title;
					preview = next;
				}
				await update({ reset: false });
			} finally {
				saving = false;
			}
		};
	};
</script>

<svelte:head><title>{data.page.title} — Nos Souhaits</title></svelte:head>
<Header name={data.name} admin={data.admin} adminPath={data.adminPath} active={data.admin ? 'listes' : 'groupes'} />

<main class="page" class:has-fab={data.page.canAdd}>
	<p class="crumb">
		{#if data.admin}
			<a href="{data.adminPath}/listes">Listes</a>
		{:else}
			<a href="/accueil">Mes groupes</a> · <a href="/groupes/{data.page.group.id}">{data.page.group.name}</a>
		{/if}
	</p>

	<section class="list-hero" data-theme={art}>
		<div>
			<p class="hero-kicker">{THEME_LABELS[data.page.theme] ?? 'Liste'}</p>
			<h1>{data.page.title}</h1>
			<p class="hero-sub">
				{#if data.page.recipient}
					Pour {data.page.recipient.name}
				{:else}
					Chacun ajoute ses souhaits
				{/if}
				· {data.page.group.name}
			</p>
			<div class="hero-pills">
				<span>{formatEventDate(data.page.eventDate)}</span>
				{#if daysUntil(data.page.eventDate)}<span>{daysUntil(data.page.eventDate)}</span>{/if}
				<span>{data.page.wishCount} souhait{data.page.wishCount > 1 ? 's' : ''}</span>
				{#if data.page.progress}
					<span>{data.page.progress.taken} sur {data.page.progress.total} déjà pris</span>
				{/if}
			</div>
		</div>
		<ThemeArt theme={data.page.theme} />
	</section>

	{#if data.page.archived}
		<p class="alert">Cette liste est archivée. On peut encore la lire, plus y ajouter de souhait.</p>
	{/if}
	{#if form?.message}
		<p class="alert">{form.message}</p>
	{/if}

	<div class="chips" role="tablist" aria-label="Filtrer les souhaits">
		<button type="button" class="chip" class:on={filter === 'tous'} onclick={() => (filter = 'tous')}>Tout le monde</button>
		{#if data.page.viewerId}
			<button type="button" class="chip" class:on={filter === 'moi'} onclick={() => (filter = 'moi')}>Mes souhaits</button>
		{/if}
		{#each sections as section}
			<button type="button" class="chip" class:on={filter === section.id} onclick={() => (filter = section.id)}>
				{section.name}
			</button>
		{/each}
	</div>

	{#if data.page.wishes.length === 0}
		<article class="group-card">
			<p class="empty-inline">
				Aucun souhait pour le moment.
				{#if data.page.canAdd}Le bouton + en bas de l’écran en ajoute un.{/if}
			</p>
		</article>
	{/if}

	{#each visible as section}
		<section class="wish-section">
			<h2>
				<Avatar name={section.name} />
				{section.name}
				{#if section.label}<small class="quiet">{section.label}</small>{/if}
			</h2>
			<div class="wish-grid">
				{#each section.wishes as wish}
					{@const label = reservationText(wish.card)}
					<article class="wish-card" class:mystery={wish.isSurprise && !wish.imageUrl}>
						<div class="wish-visual">
							{#if wish.imageUrl}
								<img src={wish.thumbUrl ?? wish.imageUrl} alt="" />
							{:else if wish.isSurprise}
								<div class="mystery-art" aria-hidden="true">
									<svg viewBox="0 0 80 80" width="72" height="72">
										<rect x="14" y="34" width="52" height="34" rx="6" fill="#e0b15a" />
										<path d="M14 42h52" stroke="#fffaf2" stroke-width="4" />
										<path d="M40 34v34" stroke="#fffaf2" stroke-width="4" />
										<path d="M40 34c-8-14-22-12-18-4s14 6 18 4c4-14 18-12 18-4s-10 10-18 4z" fill="#b8322a" />
									</svg>
								</div>
							{:else}
								<div class="mystery-art plain" aria-hidden="true"></div>
							{/if}
							{#if wish.domain}
								<span class="domain-badge">{wish.domain}</span>
							{/if}
						</div>
						<div class="wish-body">
							<div class="wish-title-row">
								<h3>{wish.title}</h3>
								<span class="star-row" aria-label={wish.priority === 1 ? 'Priorité très envie' : wish.priority === 2 ? 'Priorité j’aimerais' : 'Priorité si l’occasion'}>
									{#each [1, 2, 3] as star}
										<svg viewBox="0 0 20 20" class:on={star <= 4 - wish.priority}>
											<path d="M10 2.5 12.2 7.8 18 8.3 13.6 12.2 14.9 17.8 10 14.8 5.1 17.8 6.4 12.2 2 8.3 7.8 7.8 Z" />
										</svg>
									{/each}
								</span>
							</div>
							{#if wish.isSurprise}<p class="quiet">Cadeau surprise</p>{/if}
							{#if wish.description}<p>{wish.description}</p>{/if}
							{#if wish.url && !wish.isSurprise}
								<p><a href={wish.url} target="_blank" rel="noopener noreferrer">Voir le lien</a></p>
							{/if}
							{#if label && wish.card === 'pris'}
								<p class="taken-badge">{label}</p>
							{/if}
							{#if data.page.role === 'admin' && wish.buyer}
								<p class="quiet">Pris par {wish.buyer.name}</p>
							{/if}
							{#if wish.card === 'mien' || wish.card === 'achete'}
								<p class="taken-badge mine">{label}</p>
								{#if wish.wishUpdatedAfter}<p class="quiet">Ce souhait a changé depuis votre réservation.</p>{/if}
								<div class="card-actions">
									<form method="post" action="?/cancel">
										<input type="hidden" name="wishId" value={wish.id} />
										<button class="btn ghost small" type="submit">Annuler</button>
									</form>
									{#if wish.card === 'mien'}
										<form method="post" action="?/bought">
											<input type="hidden" name="wishId" value={wish.id} />
											<button class="btn soft small" type="submit">C’est acheté</button>
										</form>
									{/if}
								</div>
							{:else if wish.card === 'libre' && !data.page.archived}
								<form method="post" action="?/reserve">
									<input type="hidden" name="wishId" value={wish.id} />
									<button class="btn small" type="submit">Je l’achète</button>
								</form>
							{/if}
							{#if data.page.viewerId === wish.ownerId}
								<div class="card-actions">
									<button class="btn soft small" type="button" onclick={() => openEdit(wish)}>Modifier</button>
									<form
										method="post"
										action="?/deleteWish"
										onsubmit={(event) => {
											if (!confirm('Retirer ce souhait ?')) event.preventDefault();
										}}
									>
										<input type="hidden" name="wishId" value={wish.id} />
										<button class="linkish" type="submit">Retirer</button>
									</form>
								</div>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</section>
	{:else}
		{#if data.page.wishes.length > 0}
			<p class="empty-inline">Rien dans ce filtre.</p>
		{/if}
	{/each}

	{#if data.page.canEdit}
		<details class="table-card admin-list-edit">
			<summary>Modifier la liste</summary>
			<form method="post" action="?/updateList" class="stack">
				<label>Nom<input name="title" value={data.page.title} required maxlength="100" /></label>
				<label>Thème
					<select name="theme">
						{#each LIST_THEMES as theme}
							<option value={theme.id} selected={theme.id === data.page.theme || (theme.id === 'generique' && !LIST_THEMES.some((item) => item.id === data.page.theme))}>{theme.label}</option>
						{/each}
					</select>
				</label>
				<label>Date<input name="eventDate" type="date" value={data.page.eventDate ?? ''} /></label>
				<label>Personne concernée
					<select name="recipientId">
						<option value="">Tout le monde</option>
						{#each data.page.members as member}
							<option value={member.id} selected={member.id === data.page.recipient?.id}>{member.displayName}</option>
						{/each}
					</select>
				</label>
				<label class="choice"><input type="checkbox" name="archived" value="1" checked={data.page.archived} /> Archiver</label>
				<button class="btn" type="submit">Enregistrer</button>
			</form>
		</details>
	{/if}
</main>

{#if data.page.canAdd}
	<button class="fab" type="button" onclick={openNew} aria-label="Ajouter un souhait">+</button>
{/if}

<dialog class="sheet" bind:this={box} aria-labelledby="wish-dialog-title">
	<form class="sheet-body" method="post" enctype="multipart/form-data" use:enhance={onWishForm}>
		<div class="sheet-head">
			<h2 id="wish-dialog-title" class="serif">{editing ? 'Modifier le souhait' : 'Nouveau souhait'}</h2>
			<button class="close-x" type="button" onclick={() => box?.close()} aria-label="Fermer">×</button>
		</div>
		{#if editing}<input type="hidden" name="wishId" value={editing.id} />{/if}
		{#if !editing}<input type="hidden" name="idempotencyKey" value={requestKey} />{/if}
		<input type="hidden" name="previewPhotoId" value={preview?.photoId ?? ''} />
		<input type="hidden" name="previewTitle" value={preview?.title ?? ''} />
		<input type="hidden" name="previewSite" value={preview?.siteName ?? ''} />
		<label>Titre<input name="title" bind:value={title} required maxlength="200" placeholder="Un livre sur les jardins" /></label>
		<label>Lien <span class="quiet">facultatif, n’importe quel site</span>
			<input name="url" bind:value={link} type="url" maxlength="2048" placeholder="https://" />
		</label>
		<button class="btn soft small" type="submit" formaction="?/apercu" formnovalidate disabled={saving}>Lire le lien</button>
		{#if form?.message}<p class="alert">{form.message}</p>{/if}
		{#if preview?.siteName}<p class="quiet">Aperçu : {preview.siteName}</p>{/if}
		<label>Photo <span class="quiet">JPEG, PNG, WebP ou HEIC, 10 Mo</span>
			<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
		</label>
		{#if editing?.imageUrl}
			<label class="choice"><input type="checkbox" name="retirerPhoto" value="1" /> Retirer la photo</label>
		{/if}
		<fieldset class="priorities">
			<legend>Priorité</legend>
			<label class="choice"><input type="radio" name="priority" value={1} bind:group={priority} /> Très envie</label>
			<label class="choice"><input type="radio" name="priority" value={2} bind:group={priority} /> J’aimerais bien</label>
			<label class="choice"><input type="radio" name="priority" value={3} bind:group={priority} /> Si l’occasion</label>
		</fieldset>
		<label>Description<textarea name="description" bind:value={description} rows="3" maxlength="4000" placeholder="La couleur, la taille, un détail utile"></textarea></label>
		<label class="choice">
			<input type="checkbox" name="surprise" value="1" bind:checked={surprise} />
			Surprenez-moi — une idée vague, sans objet précis
		</label>
		{#if surprise}<p class="quiet">Le lien reste facultatif. La carte s’affiche comme un cadeau mystère.</p>{/if}
		<button class="btn" type="submit" formaction={editing ? '?/updateWish' : '?/createWish'} disabled={saving}>
			{saving ? 'Enregistrement…' : 'Enregistrer'}
		</button>
	</form>
</dialog>
